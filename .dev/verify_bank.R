#!/usr/bin/env Rscript
# SEMNEST — independent check of the item bank in R (lavaan + psychonetrics).
#
# Nothing of the JS engine (sem.js) is used: bank.js is only read for the model
# strings (via .dev/export_bank.js, which loads bank.js alone and dumps JSON).
#
# For every item and both directions X -> Y:
#   1. draw parameter values for model X and build Sigma_X with an R
#      implementation of the RAM formula
#        Sigma_full = (I - A)^-1 S (I - A)^-T,  Sigma = observed block,
#      where the block of S belonging to a network block is the inverse of a
#      sparse, diagonally dominant precision matrix K (GGM / RNM / LNM).
#      For models without network blocks Sigma_X is cross-checked against
#      lavaan's implied covariance matrix of the same model with all parameters
#      fixed at the drawn values.
#   2. fit model Y to Sigma_X (N = 1000) by ML:
#        - Y without network blocks: lavaan::lavaan() with auto.var, auto.fix.first,
#          fixed.x = FALSE, no automatic covariances (covariances lavaan adds on
#          its own, e.g. among exogenous observed variables, are fixed to 0);
#          the parameter table is checked against the syntax for every model;
#        - Y with network blocks: psychonetrics::ggm() (GGM on observed
#          variables) or psychonetrics::lvm() with residual = "ggm" (RNM) or
#          latent = "ggm" (LNM), identification by loadings, bounded = FALSE.
#   3. chi-square = N * F_ML(Sigma_X, Sigma_hat), computed from the implied
#      matrix of the fitted model (the tool-reported chi-square is kept too).
#      A direction is nested when chi-square < TOL for every draw and not nested
#      when some draw gives chi-square >= 0.1 (in between: "?"). If it does not
#      fit from the default start, the fit is repeated from random starts
#      (claim-blind), and with many more starts when the bank claims nesting.
#
#   Rscript .dev/verify_bank.R [idPrefix] [--draws=3] [--starts=6] [--extra=30] [--seed=2026] [--cores=1] [--neg=0]
# (--neg=0.3: robustness run in which drawn effects, covariances and partial
#  correlations get a negative sign with probability 0.3)
#
# Output: table on stdout and .dev/out/verify_bank_R.csv

suppressPackageStartupMessages({
  library(lavaan)
  library(psychonetrics)
  library(jsonlite)
})

# ------------------------------------------------------------------
# Options
# ------------------------------------------------------------------
argv <- commandArgs(trailingOnly = TRUE)
opt <- function(name, default) {
  a <- grep(paste0("^--", name, "="), argv, value = TRUE)
  if (length(a)) as.numeric(sub("^[^=]*=", "", a[1])) else default
}
FILTER <- { f <- argv[!grepl("^--", argv)]; if (length(f)) f[1] else "" }
DRAWS  <- opt("draws", 3)
STARTS <- opt("starts", 6)       # random starts for every direction that does not fit
EXTRA  <- opt("extra", 30)       # additional random starts when the bank claims nesting
SEED   <- opt("seed", 2026)
CORES  <- opt("cores", 1)
NEG    <- opt("neg", 0)          # probability of a negative sign for drawn effects, covariances, partial correlations
NOBS   <- 1000
TOL    <- 1e-3                   # chi-square below this counts as exact fit
SMALL  <- 0.1                    # 'clearly > 0' threshold (values in between are flagged)
POLISH <- 1e-6                   # chi-squares in (POLISH, SMALL) are refitted from their own solution

file_arg <- sub("^--file=", "", grep("^--file=", commandArgs(FALSE), value = TRUE))
DEV  <- if (length(file_arg)) dirname(normalizePath(file_arg)) else normalizePath(".dev")
ROOT <- dirname(DEV)

# ------------------------------------------------------------------
# Items (bank.js only)
# ------------------------------------------------------------------
items <- fromJSON(paste(system2("node", file.path(DEV, "export_bank.js"), stdout = TRUE), collapse = ""),
                  simplifyVector = FALSE)
items <- Filter(function(it) startsWith(it$id, FILTER), items)

# ------------------------------------------------------------------
# Parsing the model syntax
# ------------------------------------------------------------------
ID <- "[A-Za-z_][A-Za-z0-9_.]*"
NUM <- "-?[0-9]*\\.?[0-9]+"
trim <- function(s) gsub("^\\s+|\\s+$", "", s)

parse_terms <- function(rhs) {
  ts <- trim(strsplit(rhs, "+", fixed = TRUE)[[1]])
  ts <- ts[ts != ""]
  lapply(ts, function(t) {
    m <- regmatches(t, regexec(paste0("^(?:(", ID, "|", NUM, ")\\s*\\*\\s*)?(", ID, ")$"), t, perl = TRUE))[[1]]
    if (!length(m)) stop("Cannot read term '", t, "'")
    mod <- m[2]
    if (mod == "") list(v = m[3], label = NA_character_, fixed = NA_real_)
    else if (grepl(paste0("^", NUM, "$"), mod)) list(v = m[3], label = NA_character_, fixed = as.numeric(mod))
    else list(v = m[3], label = mod, fixed = NA_real_)
  })
}

parse_model <- function(text, obs) {
  st <- trim(sub("#.*$", "", strsplit(text, "[\n;]+")[[1]]))
  st <- st[st != ""]
  lat <- character(0)
  see <- function(v) if (!(v %in% obs) && !(v %in% lat)) lat <<- c(lat, v)
  paths <- list(); covs <- list(); nets <- list(); blocks <- list()
  rx <- function(op) paste0("^(", ID, ")\\s*", op, "\\s*(.+)$")
  for (s in st) {
    if (grepl("^network\\s+", s)) {
      b <- strsplit(trim(sub("^network\\s+", "", s)), "[[:space:],]+")[[1]]
      for (v in b) see(v)
      blocks[[length(blocks) + 1]] <- b
    } else if (grepl(rx("=~"), s)) {
      lhs <- sub(rx("=~"), "\\1", s); see(lhs)
      for (t in parse_terms(sub(rx("=~"), "\\2", s))) { see(t$v); paths[[length(paths) + 1]] <- list(from = lhs, to = t$v, op = "=~", label = t$label, fixed = t$fixed) }
    } else if (grepl(rx("~~"), s)) {
      lhs <- sub(rx("~~"), "\\1", s); see(lhs)
      for (t in parse_terms(sub(rx("~~"), "\\2", s))) { see(t$v); covs[[length(covs) + 1]] <- list(a = lhs, b = t$v, label = t$label, fixed = t$fixed) }
    } else if (grepl(rx("--"), s)) {
      lhs <- sub(rx("--"), "\\1", s); see(lhs)
      for (t in parse_terms(sub(rx("--"), "\\2", s))) { see(t$v); nets[[length(nets) + 1]] <- list(a = lhs, b = t$v) }
    } else if (grepl(rx("~"), s)) {
      lhs <- sub(rx("~"), "\\1", s); see(lhs)
      for (t in parse_terms(sub(rx("~"), "\\2", s))) { see(t$v); paths[[length(paths) + 1]] <- list(from = t$v, to = lhs, op = "~", label = t$label, fixed = t$fixed) }
    } else stop("Cannot read statement '", s, "'")
  }
  # undirected edges between variables of no declared block: one block of their endpoints
  inb <- unlist(blocks)
  loose <- setdiff(unique(unlist(lapply(nets, function(e) c(e$a, e$b)))), inb)
  if (length(loose)) blocks[[length(blocks) + 1]] <- loose
  list(obs = obs, lat = lat, paths = paths, covs = covs, nets = nets, blocks = blocks, text = text)
}

# ------------------------------------------------------------------
# Model = list of entries (kind A: directed effect, S: (co)variance,
# K: precision element of a network block)
# ------------------------------------------------------------------
# Latent scale: lavaan's auto.fix.first rule (the first indicator in the =~
# statements of each latent has loading 1; if that loading carries a label,
# the label is fixed to 1). For the two items where the first loading is
# labelled (E13 B, M10 A) this differs from "first unlabelled loading" only
# by a rescaling of the latent variables, i.e. the same set of covariance
# matrices.
build_model <- function(text, obs) {
  sp <- parse_model(text, obs)
  vars <- c(obs, sp$lat); p <- length(obs); n <- length(vars)
  idx <- setNames(seq_len(n), vars)
  E <- list()
  add <- function(...) E[[length(E) + 1]] <<- list(...)
  markers <- integer(0); marker_labels <- character(0)
  for (l in sp$lat) {
    k <- which(vapply(sp$paths, function(e) e$op == "=~" && e$from == l, TRUE))
    if (length(k)) {
      markers <- c(markers, k[1])
      if (!is.na(sp$paths[[k[1]]]$label)) marker_labels <- c(marker_labels, sp$paths[[k[1]]]$label)
    }
  }
  for (k in seq_along(sp$paths)) {
    e <- sp$paths[[k]]
    fx <- e$fixed
    if (k %in% markers || (!is.na(e$label) && e$label %in% marker_labels)) fx <- 1
    add(kind = "A", i = idx[[e$to]], j = idx[[e$from]], op = e$op, label = e$label, fixed = fx, block = NA, marker = k %in% markers)
  }
  blockOf <- rep(NA_integer_, n)
  for (bi in seq_along(sp$blocks)) {
    b <- sp$blocks[[bi]]
    if (!(all(b %in% obs) || all(b %in% sp$lat))) stop("network block mixes observed and latent variables")
    blockOf[idx[b]] <- bi
    for (v in b) add(kind = "K", i = idx[[v]], j = idx[[v]], op = "--", label = NA_character_, fixed = NA_real_, block = bi, marker = FALSE)
  }
  for (e in sp$nets) {
    i <- idx[[e$a]]; j <- idx[[e$b]]
    if (is.na(blockOf[i]) || !identical(blockOf[i], blockOf[j])) stop("edge ", e$a, " -- ", e$b, " is not inside one network block")
    add(kind = "K", i = max(i, j), j = min(i, j), op = "--", label = NA_character_, fixed = NA_real_, block = blockOf[i], marker = FALSE)
  }
  for (k in seq_len(n)) {
    if (!is.na(blockOf[k])) next
    self <- Filter(function(c) c$a == vars[k] && c$b == vars[k], sp$covs)
    if (length(self)) add(kind = "S", i = k, j = k, op = "~~", label = self[[1]]$label, fixed = self[[1]]$fixed, block = NA, marker = FALSE)
    else add(kind = "S", i = k, j = k, op = "~~", label = NA_character_, fixed = NA_real_, block = NA, marker = FALSE)
  }
  for (c in sp$covs) {
    i <- idx[[c$a]]; j <- idx[[c$b]]
    if (i == j) next
    if (!is.na(blockOf[i]) && identical(blockOf[i], blockOf[j])) stop("use -- inside a network block")
    add(kind = "S", i = max(i, j), j = min(i, j), op = "~~", label = c$label, fixed = c$fixed, block = NA, marker = FALSE)
  }
  ent <- do.call(rbind, lapply(E, as.data.frame, stringsAsFactors = FALSE))
  list(spec = sp, vars = vars, n = n, p = p, idx = idx, ent = ent, blockOf = blockOf,
       network = length(sp$blocks) > 0)
}

# number of free parameters (labels count once)
n_free <- function(M) {
  f <- M$ent[is.na(M$ent$fixed), ]
  sum(is.na(f$label)) + length(unique(f$label[!is.na(f$label)]))
}

# ------------------------------------------------------------------
# Drawing Sigma_X
# ------------------------------------------------------------------
draw_values <- function(M) {
  ent <- M$ent
  val <- rep(NA_real_, nrow(ent))
  lab <- list()
  sgn <- function() if (NEG > 0 && runif(1) < NEG) -1 else 1
  rng <- function(e) {
    if (e$kind == "A") return(sgn() * if (e$op == "=~") runif(1, .5, 1.1) else runif(1, .25, .75))
    if (e$kind == "S") return(if (e$i == e$j) runif(1, .4, 1.2) else sgn() * runif(1, .1, .3))
    NA_real_
  }
  for (r in seq_len(nrow(ent))) {
    e <- ent[r, ]
    if (!is.na(e$fixed)) { val[r] <- e$fixed; next }
    if (e$kind == "K") next
    if (!is.na(e$label)) {
      if (is.null(lab[[e$label]])) lab[[e$label]] <- rng(e)
      val[r] <- lab[[e$label]]
    } else val[r] <- rng(e)
  }
  # precision matrices: edges -U(.2,.45) (positive partial correlations), diagonal dominant
  for (bi in unique(na.omit(ent$block))) {
    rk <- which(ent$kind == "K" & ent$block == bi)
    off <- rk[ent$i[rk] != ent$j[rk]]
    val[off] <- -vapply(off, function(r) sgn() * runif(1, .2, .45), 0)
    for (r in rk[ent$i[rk] == ent$j[rk]]) {
      v <- ent$i[r]
      touching <- off[ent$i[off] == v | ent$j[off] == v]
      val[r] <- sum(abs(val[touching])) + runif(1, .5, 1)
    }
  }
  val
}

ram_sigma <- function(M, val, full = FALSE) {
  n <- M$n; ent <- M$ent
  A <- matrix(0, n, n); S <- matrix(0, n, n)
  for (r in which(ent$kind == "A")) A[ent$i[r], ent$j[r]] <- val[r]
  for (r in which(ent$kind == "S")) S[ent$i[r], ent$j[r]] <- S[ent$j[r], ent$i[r]] <- val[r]
  for (bi in unique(na.omit(ent$block))) {
    vs <- which(M$blockOf == bi)
    K <- matrix(0, length(vs), length(vs))
    for (r in which(ent$kind == "K" & ent$block == bi)) {
      a <- match(ent$i[r], vs); b <- match(ent$j[r], vs)
      K[a, b] <- K[b, a] <- val[r]
    }
    S[vs, vs] <- solve(K)
  }
  B <- solve(diag(n) - A)
  Sf <- B %*% S %*% t(B)
  dimnames(Sf) <- list(M$vars, M$vars)
  if (full) Sf else Sf[seq_len(M$p), seq_len(M$p), drop = FALSE]
}

draw_sigma <- function(M) {
  for (tries in 1:500) {
    val <- draw_values(M)
    Sig <- ram_sigma(M, val)
    ev <- eigen(Sig, symmetric = TRUE, only.values = TRUE)$values
    if (min(ev) > 1e-3 * max(ev)) return(list(Sigma = (Sig + t(Sig)) / 2, val = val))
  }
  stop("could not draw a positive definite Sigma")
}

# ------------------------------------------------------------------
# lavaan
# ------------------------------------------------------------------
LAVOPTS <- list(auto.var = TRUE, auto.fix.first = TRUE, fixed.x = FALSE, meanstructure = FALSE,
                auto.cov.lv.x = FALSE, auto.cov.y = FALSE, sample.cov.rescale = FALSE,
                se = "none", warn = FALSE)

dummy_cov <- function(obs) { D <- diag(length(obs)); dimnames(D) <- list(obs, obs); D }

# lavaan syntax for model M: the statements as written + variances for observed
# variables that are never mentioned + 0-fixes for covariances lavaan adds itself
lavaan_syntax <- function(M, body) {
  mentioned <- unique(unlist(regmatches(body, gregexpr(ID, body))))
  extra <- vapply(setdiff(M$spec$obs, mentioned), function(v) paste0(v, " ~~ ", v), "")
  syn <- c(body, extra)
  pt <- do.call(lavaanify, c(list(model = paste(syn, collapse = "\n")), LAVOPTS[c("auto.var", "auto.fix.first", "fixed.x", "meanstructure", "auto.cov.lv.x", "auto.cov.y")]))
  auto <- which(pt$op == "~~" & pt$lhs != pt$rhs & pt$user == 0)
  zero <- if (length(auto)) paste0(pt$lhs[auto], " ~~ 0*", pt$rhs[auto]) else character(0)
  paste(c(syn, zero), collapse = "\n")
}

lav_body <- function(M) {
  st <- trim(sub("#.*$", "", strsplit(M$spec$text, "[\n;]+")[[1]]))
  st[st != ""]
}

# all parameters fixed at val (to cross-check Sigma_X with lavaan)
lav_fixed_body <- function(M, val) {
  ent <- M$ent; v <- M$vars
  out <- character(0)
  for (r in seq_len(nrow(ent))) {
    e <- ent[r, ]; x <- sprintf("%.17g", val[r])
    out <- c(out, switch(e$kind,
      A = if (e$op == "=~") paste0(v[e$j], " =~ ", x, "*", v[e$i]) else paste0(v[e$i], " ~ ", x, "*", v[e$j]),
      S = paste0(v[e$i], " ~~ ", x, "*", v[e$j]),
      stop("network models cannot be expressed in lavaan")))
  }
  out
}

lav_implied <- function(M, val) {
  syn <- lavaan_syntax(M, lav_fixed_body(M, val))
  fit <- do.call(lavaan, c(list(model = syn, sample.cov = dummy_cov(M$spec$obs), sample.nobs = NOBS, do.fit = FALSE), LAVOPTS))
  if (lavInspect(fit, "npar") != 0) stop("fixed-value model has free parameters")
  S <- lavInspect(fit, "implied")$cov
  S[M$spec$obs, M$spec$obs]
}

# check lavaan's parameter table against the entries of M (free / fixed values / labels)
lav_check_partable <- function(M, syn) {
  fit <- do.call(lavaan, c(list(model = syn, sample.cov = dummy_cov(M$spec$obs), sample.nobs = NOBS, do.fit = FALSE), LAVOPTS))
  pt <- parTable(fit)
  pt <- pt[pt$op %in% c("=~", "~", "~~"), ]
  key_pt <- ifelse(pt$op == "~~", paste("~~", pmin(pt$lhs, pt$rhs), pmax(pt$lhs, pt$rhs)), paste(pt$op, pt$lhs, pt$rhs))
  ent <- M$ent; v <- M$vars
  key_m <- ifelse(ent$kind == "S", paste("~~", pmin(v[ent$i], v[ent$j]), pmax(v[ent$i], v[ent$j])),
                  ifelse(ent$op == "=~", paste("=~", v[ent$j], v[ent$i]), paste("~", v[ent$i], v[ent$j])))
  probs <- character(0)
  if (anyDuplicated(key_pt)) probs <- c(probs, "duplicated rows in lavaan table")
  for (r in seq_len(nrow(ent))) {
    k <- match(key_m[r], key_pt)
    if (is.na(k)) { probs <- c(probs, paste("missing in lavaan:", key_m[r])); next }
    if (is.na(ent$fixed[r])) {
      if (pt$free[k] == 0) probs <- c(probs, paste("fixed in lavaan, free in syntax:", key_m[r]))
      if (!identical(ifelse(is.na(ent$label[r]), "", ent$label[r]), pt$label[k])) probs <- c(probs, paste("label differs:", key_m[r]))
    } else {
      if (pt$free[k] != 0 || abs(pt$ustart[k] - ent$fixed[r]) > 1e-12) probs <- c(probs, paste("fixed value differs:", key_m[r]))
    }
  }
  extra <- setdiff(seq_along(key_pt), match(key_m, key_pt))
  for (k in extra) if (pt$free[k] != 0 || abs(pt$ustart[k]) > 1e-12) probs <- c(probs, paste("extra lavaan parameter:", key_pt[k]))
  npar <- lavInspect(fit, "npar")
  # equality constraints may be explicit '==' rows: count free minus constraints
  pfull <- parTable(fit)
  n_eq <- sum(pfull$op == "==")
  if (npar - n_eq != n_free(M)) probs <- c(probs, sprintf("free parameters: lavaan %d (- %d ==), syntax %d", npar, n_eq, n_free(M)))
  probs
}

ml_chisq <- function(S, Sh) {
  if (is.null(Sh) || any(!is.finite(Sh))) return(NA_real_)
  Sh <- (Sh + t(Sh)) / 2
  ev <- eigen(Sh, symmetric = TRUE, only.values = TRUE)$values
  if (min(ev) <= 0) return(NA_real_)
  p <- nrow(S)
  F <- as.numeric(determinant(Sh)$modulus - determinant(S)$modulus) + sum(diag(S %*% solve(Sh))) - p
  NOBS * max(F, 0)
}

lav_fit <- function(L, Sigma, start = NULL) {
  args <- c(list(model = L$syntax, sample.cov = Sigma, sample.nobs = NOBS), LAVOPTS)
  if (!is.null(start)) args$start <- start
  fit <- tryCatch(suppressMessages(suppressWarnings(do.call(lavaan, args))), error = function(e) NULL)
  if (is.null(fit)) return(list(chisq = NA_real_, reported = NA_real_, fit = NULL, conv = FALSE))
  Sh <- tryCatch(lavInspect(fit, "implied")$cov[L$obs, L$obs], error = function(e) NULL)
  rep <- tryCatch(as.numeric(fitMeasures(fit, "chisq")), error = function(e) NA_real_)
  list(chisq = ml_chisq(Sigma, Sh), reported = rep, fit = fit, conv = isTRUE(lavInspect(fit, "converged")))
}

# Alternative lavaan syntax for a fallback when the best fit does not converge:
# a latent whose first indicator (the default marker) has several parents gets
# the first single-parent indicator as marker instead (NA* on the old one, 1* on
# the new one). This is the same model (same closure of the set of implied
# matrices) but avoids solutions where the marker loading should go to 0 and
# the other parameters diverge (e.g. M16).
lav_body_alt <- function(M) {
  sp <- M$spec
  npar <- table(factor(vapply(sp$paths, function(e) e$to, ""), levels = M$vars))
  mod <- function(e) if (!is.na(e$label)) paste0(e$label, "*") else if (!is.na(e$fixed)) paste0(sprintf("%.17g", e$fixed), "*") else ""
  mods <- lapply(sp$paths, mod)
  changed <- FALSE
  for (l in sp$lat) {
    k <- which(vapply(sp$paths, function(e) e$op == "=~" && e$from == l, TRUE))
    if (!length(k)) next
    first <- sp$paths[[k[1]]]
    if (npar[[first$to]] <= 1 || !is.na(first$label) || !is.na(first$fixed)) next
    cand <- k[vapply(k, function(j) { e <- sp$paths[[j]]; npar[[e$to]] == 1 && is.na(e$label) && is.na(e$fixed) }, TRUE)]
    if (!length(cand)) next
    mods[[k[1]]] <- "NA*"; mods[[cand[1]]] <- "1*"; changed <- TRUE
  }
  if (!changed) return(NULL)
  c(vapply(seq_along(sp$paths), function(j) { e <- sp$paths[[j]]
      if (e$op == "=~") paste0(e$from, " =~ ", mods[[j]], e$to) else paste0(e$to, " ~ ", mods[[j]], e$from) }, ""),
    vapply(sp$covs, function(c) paste0(c$a, " ~~ ", mod(c), c$b), ""))
}

# random starting values; with neg = TRUE every latent (residual) variance is
# negative with probability 1/2 (solutions with negative latent variances, e.g.
# a group factor whose three residual covariances have a negative product,
# are not reachable from positive starts), observed residual variances are then
# started large enough to keep the implied matrix positive definite
lav_random_start <- function(L, Sigma, neg = FALSE) {
  pt <- L$pt
  est <- pt$ustart
  free <- pt$free > 0
  lab <- list()
  sv <- diag(Sigma)
  for (k in which(free)) {
    var_lat <- function() if (neg && runif(1) < .5) -runif(1, .05, .5) else runif(1, .1, 1.5)
    var_obs <- function() if (neg) runif(1, .9, 1.3) * sv[[pt$lhs[k]]] else runif(1, .05, 1) * sv[[pt$lhs[k]]]
    x <- switch(pt$op[k],
      "=~" = if (neg) sample(c(-1, 1), 1) * runif(1, .3, 1.2) else runif(1, -0.5, 1.6),
      "~"  = runif(1, -0.5, 1.0),
      "~~" = if (pt$lhs[k] == pt$rhs[k]) (if (pt$lhs[k] %in% L$obs) var_obs() else var_lat()) else runif(1, -.3, .3),
      0)
    if (nzchar(pt$label[k])) { if (is.null(lab[[pt$label[k]]])) lab[[pt$label[k]]] <- x; x <- lab[[pt$label[k]]] }
    est[k] <- x
  }
  pt$est <- est; pt$start <- est
  pt
}

# ------------------------------------------------------------------
# psychonetrics
# ------------------------------------------------------------------
pn_model <- function(M, Sigma) {
  sp <- M$spec; obs <- sp$obs; lat <- sp$lat; ent <- M$ent; v <- M$vars
  p <- length(obs); q <- length(lat)
  if (any(!is.na(ent$label))) stop("labels are not supported on the psychonetrics side")
  if (any(!is.na(ent$fixed) & !ent$marker)) stop("fixed values are not supported on the psychonetrics side")
  isLat <- function(i) i > p
  A <- ent[ent$kind == "A", ]; S <- ent[ent$kind == "S" & ent$i != ent$j, ]; K <- ent[ent$kind == "K" & ent$i != ent$j, ]
  if (any(!isLat(A$j))) stop("effects of observed variables are not supported on the psychonetrics side")
  if (q == 0) {
    if (nrow(S)) stop("GGM with extra covariances not supported")
    om <- matrix(0, p, p, dimnames = list(obs, obs))
    for (r in seq_len(nrow(K))) om[K$i[r], K$j[r]] <- om[K$j[r], K$i[r]] <- 1
    return(ggm(covs = Sigma, nobs = NOBS, omega = om, vars = obs, covtype = "ML", verbose = FALSE))
  }
  lambda <- matrix(0, p, q, dimnames = list(obs, lat))
  beta <- matrix(0, q, q, dimnames = list(lat, lat))
  for (r in seq_len(nrow(A))) {
    if (isLat(A$i[r])) beta[A$i[r] - p, A$j[r] - p] <- 1 else lambda[A$i[r], A$j[r] - p] <- 1
  }
  if (any(isLat(S$i) != isLat(S$j))) stop("covariances between observed and latent variables not supported")
  latBlock <- any(!is.na(M$blockOf[-(1:p)])); obsBlock <- any(!is.na(M$blockOf[1:p]))
  args <- list(covs = Sigma, nobs = NOBS, lambda = lambda, beta = beta, vars = obs, latents = lat,
               identification = "loadings", covtype = "ML", verbose = FALSE)
  Kl <- K[isLat(K$i), ]; Ko <- K[!isLat(K$i), ]
  Sl <- S[isLat(S$i), ]; So <- S[!isLat(S$i), ]
  if (latBlock) {
    if (nrow(Sl)) stop("latent network plus latent covariances not supported")
    om <- matrix(0, q, q); for (r in seq_len(nrow(Kl))) om[Kl$i[r] - p, Kl$j[r] - p] <- om[Kl$j[r] - p, Kl$i[r] - p] <- 1
    args$latent <- "ggm"; args$omega_zeta <- om
  } else {
    sz <- diag(q); for (r in seq_len(nrow(Sl))) sz[Sl$i[r] - p, Sl$j[r] - p] <- sz[Sl$j[r] - p, Sl$i[r] - p] <- 1
    args$latent <- "cov"; args$sigma_zeta <- sz
  }
  if (obsBlock) {
    if (nrow(So)) stop("residual network plus residual covariances not supported")
    om <- matrix(0, p, p); for (r in seq_len(nrow(Ko))) om[Ko$i[r], Ko$j[r]] <- om[Ko$j[r], Ko$i[r]] <- 1
    args$residual <- "ggm"; args$omega_epsilon <- om
  } else {
    se <- diag(p); for (r in seq_len(nrow(So))) se[So$i[r], So$j[r]] <- se[So$j[r], So$i[r]] <- 1
    args$residual <- "cov"; args$sigma_epsilon <- se
  }
  do.call(lvm, args)
}

quiet <- function(expr) {
  op <- options(show.error.messages = FALSE); on.exit(options(op))   # psychonetrics prints caught try() errors
  suppressWarnings(suppressMessages(expr))
}

pn_check <- function(M) {
  m <- quiet(pn_model(M, dummy_cov(M$spec$obs) + 0.5))
  pr <- m@parameters
  k <- sum(!pr$fixed & !(pr$matrix %in% c("nu", "nu_eta")))
  if (k != n_free(M)) sprintf("free parameters: psychonetrics %d, syntax %d", k, n_free(M)) else character(0)
}

pn_run <- function(m, optimizer = NULL) {
  if (!is.null(optimizer)) m <- tryCatch(quiet(setoptimizer(m, optimizer)), error = function(e) m)
  tryCatch(quiet(
    runmodel(m, verbose = FALSE, bounded = FALSE, addMIs = FALSE, addSEs = FALSE, addInformation = FALSE,
             warn_gradient = FALSE, warn_bounds = FALSE, warn_improper = FALSE)),
    error = function(e) NULL)
}

pn_result <- function(fit, Sigma) {
  if (is.null(fit)) return(list(chisq = NA_real_, reported = NA_real_, fit = NULL, conv = FALSE))
  Sh <- tryCatch(fit@modelmatrices[[1]]$sigma, error = function(e) NULL)
  list(chisq = ml_chisq(Sigma, Sh), reported = tryCatch(fit@fitmeasures$chisq, error = function(e) NA_real_), fit = fit,
       conv = isTRUE(fit@optim$convergence == 0))
}

pn_fit <- function(M, Sigma, perturb = FALSE) {
  m <- tryCatch(quiet(pn_model(M, Sigma)), error = function(e) NULL)
  if (is.null(m)) return(list(chisq = NA_real_, reported = NA_real_, fit = NULL, conv = FALSE))
  if (perturb) {
    pr <- m@parameters; fr <- which(!pr$fixed & !(pr$matrix %in% c("nu", "nu_eta")))
    for (k in fr) {
      x <- pr$est[k]
      pr$est[k] <- switch(pr$matrix[k],
        lambda = x * runif(1, .3, 1.7) + rnorm(1, 0, .3),
        beta = runif(1, -.5, 1),
        omega_zeta = , omega_epsilon = , omega = runif(1, -.15, .35),
        delta_zeta = , delta_epsilon = , delta = x * runif(1, .6, 1.5),
        sigma_zeta = , sigma_epsilon = if (pr$row[k] == pr$col[k]) x * runif(1, .3, 1.7) else runif(1, -.2, .2),
        x)
    }
    m@parameters <- pr
  }
  pn_result(pn_run(m), Sigma)
}

# ------------------------------------------------------------------
# Fitting model Y to Sigma (with restarts)
# ------------------------------------------------------------------
prepare <- function(M) {
  if (M$network) {
    probs <- pn_check(M)
    return(list(tool = "psychonetrics", M = M, probs = probs))
  }
  lav_pt <- function(syn) parTable(do.call(lavaan, c(list(model = syn, sample.cov = dummy_cov(M$spec$obs), sample.nobs = NOBS, do.fit = FALSE), LAVOPTS)))
  syn <- lavaan_syntax(M, lav_body(M))
  probs <- lav_check_partable(M, syn)
  L <- list(tool = "lavaan", M = M, syntax = syn, pt = lav_pt(syn), obs = M$spec$obs, probs = probs)
  ba <- lav_body_alt(M)
  if (!is.null(ba)) {
    syn2 <- lavaan_syntax(M, ba); pt2 <- lav_pt(syn2)
    if (sum(pt2$free > 0) - sum(pt2$op == "==") == n_free(M)) L$alt <- list(tool = "lavaan", M = M, syntax = syn2, pt = pt2, obs = M$spec$obs)
    else L$probs <- c(L$probs, "alternative-marker syntax has a different number of parameters")
  }
  L
}

fit_once <- function(L, Sigma, attempt) {
  if (L$tool == "lavaan") {
    st <- if (attempt == 0) NULL else if (attempt == 1) "simple" else lav_random_start(L, Sigma, neg = attempt %% 2 == 1)
    r <- lav_fit(L, Sigma, st)
    # polish: restart from the solution when close to zero
    for (pol in 1:2) if (!is.null(r$fit) && is.finite(r$chisq) && r$chisq > POLISH && r$chisq < SMALL) {
      r2 <- lav_fit(L, Sigma, r$fit)
      if (is.finite(r2$chisq) && r2$chisq < r$chisq) r <- r2 else break
    }
  } else {
    r <- pn_fit(L$M, Sigma, perturb = attempt > 0)
    for (pol in 1:2) if (!is.null(r$fit) && is.finite(r$chisq) && r$chisq > POLISH && r$chisq < SMALL) {
      r2 <- pn_result(pn_run(r$fit, "ucminf"), Sigma)   # polish with ucminf (more precise than nlminb here)
      if (is.finite(r2$chisq) && r2$chisq < r$chisq) r <- r2 else break
    }
  }
  r
}

# best chi-square over starts; stops as soon as an exact fit is found
fit_best <- function(L, Sigma, nstarts) {
  run <- function(L) {
    best <- list(chisq = Inf, reported = NA_real_, conv = FALSE); used <- 0
    for (a in 0:nstarts) {
      used <- used + 1
      r <- fit_once(L, Sigma, a)
      if (is.finite(r$chisq) && r$chisq < best$chisq) best <- r
      if (best$chisq < TOL) break
    }
    list(chisq = best$chisq, reported = best$reported, conv = best$conv, used = used, alt = FALSE)
  }
  b <- run(L)
  if (b$chisq >= TOL && !b$conv && !is.null(L$alt)) {
    b2 <- run(L$alt)
    if (b2$chisq < b$chisq) { b2$used <- b2$used + b$used; b2$alt <- TRUE; b <- b2 } else b$used <- b$used + b2$used
  }
  b
}

# ------------------------------------------------------------------
# Run
# ------------------------------------------------------------------
check_item <- function(k) {
  it <- items[[k]]
  obs <- unlist(it$obs)
  MA <- build_model(it$A, obs); MB <- build_model(it$B, obs)
  LA <- prepare(MA); LB <- prepare(MB)
  notes <- c(if (length(LA$probs)) paste("A:", LA$probs), if (length(LB$probs)) paste("B:", LB$probs))
  claimAB <- it$rel %in% c("equiv", "AinB"); claimBA <- it$rel %in% c("equiv", "BinA")
  res <- list(AB = numeric(0), BA = numeric(0), selfA = numeric(0), selfB = numeric(0),
              repAB = numeric(0), repBA = numeric(0), usedAB = 0, usedBA = 0, sigdiff = 0,
              altAB = FALSE, altBA = FALSE, ncAB = FALSE, ncBA = FALSE)
  one_dir <- function(MX, LX, LY, claim, dir, d) {
    set.seed(SEED + 1000 * it$level + 10 * as.integer(substring(it$id, 2)) + d + 5 * dir)
    dr <- draw_sigma(MX)
    sd <- if (!MX$network) max(abs(lav_implied(MX, dr$val) - dr$Sigma)) else 0
    r <- fit_best(LY, dr$Sigma, STARTS)
    if (r$chisq >= TOL && claim && EXTRA > 0) {
      r2 <- fit_best(LY, dr$Sigma, EXTRA)
      r2$used <- r2$used + r$used
      if (r2$chisq < r$chisq) r <- r2 else r$used <- r2$used
    }
    r$nonconv <- r$chisq >= TOL && !r$conv
    # self-fit: model X to its own Sigma (sanity check of generator + fitter)
    s <- fit_best(LX, dr$Sigma, STARTS)
    if (s$chisq >= TOL && EXTRA > 0) { s2 <- fit_best(LX, dr$Sigma, EXTRA); if (s2$chisq < s$chisq) s <- s2 }
    list(chisq = r$chisq, reported = r$reported, used = r$used, self = s$chisq, sd = sd, alt = r$alt, nonconv = r$nonconv)
  }
  for (d in seq_len(DRAWS)) {
    a <- one_dir(MA, LA, LB, claimAB, 1, d)
    b <- one_dir(MB, LB, LA, claimBA, 2, d)
    res$AB <- c(res$AB, a$chisq); res$repAB <- c(res$repAB, a$reported); res$usedAB <- res$usedAB + a$used
    res$BA <- c(res$BA, b$chisq); res$repBA <- c(res$repBA, b$reported); res$usedBA <- res$usedBA + b$used
    res$selfA <- c(res$selfA, a$self); res$selfB <- c(res$selfB, b$self)
    res$sigdiff <- max(res$sigdiff, a$sd, b$sd)
    res$altAB <- res$altAB || a$alt; res$altBA <- res$altBA || b$alt
    res$ncAB <- res$ncAB || a$nonconv; res$ncBA <- res$ncBA || b$nonconv
  }
  # nested: every draw fits exactly; not nested: some draw clearly misfits (after restarts)
  nest <- function(x) if (all(is.finite(x) & x < TOL)) TRUE else if (any(is.finite(x) & x >= SMALL)) FALSE else NA
  ab <- nest(res$AB); ba <- nest(res$BA)
  relR <- if (is.na(ab) || is.na(ba)) "?" else if (ab && ba) "equiv" else if (ab) "AinB" else if (ba) "BinA" else "neither"
  mixed <- function(x) any(x < TOL, na.rm = TRUE) && any(x >= TOL, na.rm = TRUE)
  if (mixed(res$AB)) notes <- c(notes, "A->B: some draws fit exactly, others not")
  if (mixed(res$BA)) notes <- c(notes, "B->A: some draws fit exactly, others not")
  if (any(res$AB >= TOL & res$AB < SMALL, na.rm = TRUE)) notes <- c(notes, "A->B: a chi2 in [TOL, 0.1)")
  if (any(res$BA >= TOL & res$BA < SMALL, na.rm = TRUE)) notes <- c(notes, "B->A: a chi2 in [TOL, 0.1)")
  if (any(!(res$selfA < TOL), na.rm = TRUE) || any(is.na(res$selfA))) notes <- c(notes, "self-fit A failed")
  if (any(!(res$selfB < TOL), na.rm = TRUE) || any(is.na(res$selfB))) notes <- c(notes, "self-fit B failed")
  if (res$altAB) notes <- c(notes, "A->B: lavaan fit with alternative markers (default markers did not converge)")
  if (res$altBA) notes <- c(notes, "B->A: lavaan fit with alternative markers (default markers did not converge)")
  if (res$ncAB) notes <- c(notes, "A->B: best fit not converged")
  if (res$ncBA) notes <- c(notes, "B->A: best fit not converged")
  if (res$sigdiff > 1e-8) notes <- c(notes, sprintf("Sigma differs from lavaan implied (%.1e)", res$sigdiff))
  row <- data.frame(id = it$id, level = it$level, claimed = it$rel, fitA = LA$tool, fitB = LB$tool,
                    stringsAsFactors = FALSE)
  for (d in seq_len(DRAWS)) row[[paste0("chi2_AB_", d)]] <- res$AB[d]
  for (d in seq_len(DRAWS)) row[[paste0("chi2_BA_", d)]] <- res$BA[d]
  for (d in seq_len(DRAWS)) row[[paste0("tool_chi2_AB_", d)]] <- res$repAB[d]
  for (d in seq_len(DRAWS)) row[[paste0("tool_chi2_BA_", d)]] <- res$repBA[d]
  row$fits_AB <- res$usedAB; row$fits_BA <- res$usedBA
  row$self_A_max <- max(res$selfA); row$self_B_max <- max(res$selfB)
  row$sigma_check <- res$sigdiff
  row$rel_R <- relR
  row$agree <- relR == it$rel
  row$notes <- paste(notes, collapse = "; ")
  row
}

t0 <- Sys.time()
run1 <- function(k) {
  r <- tryCatch(check_item(k), error = function(e) {
    data.frame(id = items[[k]]$id, level = items[[k]]$level, claimed = items[[k]]$rel, rel_R = "ERROR",
               agree = FALSE, notes = conditionMessage(e), stringsAsFactors = FALSE)
  })
  fmt <- function(x) ifelse(is.na(x), "   NA  ", formatC(x, format = "e", digits = 1, width = 7))
  ab <- unlist(r[grep("^chi2_AB_", names(r))]); ba <- unlist(r[grep("^chi2_BA_", names(r))])
  cat(sprintf("%s %s %-7s R:%-7s A->B %s | B->A %s  [%s/%s] %s\n",
              if (isTRUE(r$agree)) "OK  " else "DIFF", r$id, r$claimed, r$rel_R,
              paste(fmt(ab), collapse = " "), paste(fmt(ba), collapse = " "),
              if (is.null(r$fitA)) "" else substr(r$fitA, 1, 4), if (is.null(r$fitB)) "" else substr(r$fitB, 1, 4),
              r$notes))
  r
}
rows <- if (CORES > 1) parallel::mclapply(seq_along(items), run1, mc.cores = CORES, mc.preschedule = FALSE) else lapply(seq_along(items), run1)
cols <- unique(unlist(lapply(rows, names)))
tab <- do.call(rbind, lapply(rows, function(r) { for (c in setdiff(cols, names(r))) r[[c]] <- NA; r[cols] }))

dir.create(file.path(DEV, "out"), showWarnings = FALSE)
out <- file.path(DEV, "out", "verify_bank_R.csv")
write.csv(tab, out, row.names = FALSE)

cat("\n")
print(tab[, intersect(c("id", "claimed", "rel_R", "agree", grep("^chi2_", cols, value = TRUE), "self_A_max", "self_B_max"), cols)],
      digits = 2, row.names = FALSE)
cat(sprintf("\n%d items: %d agree, %d disagree (%.1f s). Table: %s\n", nrow(tab), sum(tab$agree), sum(!tab$agree),
            as.numeric(difftime(Sys.time(), t0, units = "secs")), out))
