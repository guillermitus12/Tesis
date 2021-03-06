

computeIntersections <- function(X, ii, D) {
    k <- nrow(X)
    nl <- ncol(X)
    V <- X - matlab::repmat(t(t(as.matrix(X[, ii]))), 1, nl)
    Daux <- t(t(sqrt((apply(V * V, 2, sum)))))

    Q <- as.matrix(D[ii, ])/Daux  #mirar el operador

    Z <- X - V * matlab::repmat(Q, k, 1)
    Z <- Z[, -ii]
    return(Z)
}


randomMatrix <- function(NRows, NCols) {
    myMat <- matrix(runif(NCols * NRows), ncol = NCols)
    return(myMat)
}

distAllPairsL2 <- function(X) {
    q <- t(X) %*% X
    n <- ncol(q)
    normx <- matlab::repmat(as.matrix(apply(t(X)^2, 1, sum)), 1, n)
    K <- Re(sqrtm(q * (-2) + normx + t(normx)))
    K <- K - (diag(diag(K)))
    return(K)
}

univMDSrobust <- function(D, k) {
    iteraciones <- 150
    tol <- 1e-09
    nl <- nrow(D)  #numer of specimens
    X <- t(randomMatrix(nl, k))
    Dk <- distAllPairsL2(X)
    c <- sum((D - Dk))
    cant <- 0

    for (iter in 1:iteraciones) {
        print(iter)
        for (ii in 1:nl) {
            for (it in 1:floor(sqrt(iter))) {
                Z <- computeIntersections(X, ii, D)
                b <- spatialmed_landmark(t(Z))  #porque Z transpuesto??
                a <- t(b)

                x1 <- cbind(t(t(X[, 1:ii - 1])), a)
                if ((ii + 1) <= nl) {

                  X <- cbind(x1, t(t(X[, (ii + 1):nl])))

                } else {
                  X <- x1
                }



            }
        }

        Dk <- distAllPairsL2(X)
        cant <- c
        c <- sum(sum((D - Dk)))
        if (abs(c - cant) < tol) {
            break
        }
    }

    return(t(X))
}


spatialmed_landmark <- function(X) {
    tol = 1e-09

    n <- nrow(X)
    p <- ncol(X)

    m <- matrix(nrow = 1, ncol = p, 0)
    A <- matrix(nrow = n, ncol = p, 0)

    w <- matrix(nrow = 1, ncol = n, 1)
    s <- matrix(nrow = 1, ncol = n, 0)
    aux <- matrix(nrow = 1, ncol = p, 0)
    auxant <- matrix(nrow = 1, ncol = p, 0)

    tdemu <- matrix(nrow = 1, ncol = p, 0)
    rdemu <- matrix(nrow = 1, ncol = p, 0)
    gamagama <- 0
    sensor <- 0

    A <- X


    aux <- apply(A, 2, mean)  #aux <- w%*%A/sum(w)

    h <- 1
    # print(A)

    while ((median(abs(aux - auxant)) > tol) & (h <= 1000)) {
        # print('imprimo s:') print(aux)
        # print('******************************************************') print('AUX: ') print(aux)
        for (k in 1:n) {
            # print('A[k,]') print(t(as.matrix(A[k,]))) print(norm(aux - t(as.matrix(A[k,])) ) )
            if (norm(aux - t(as.matrix(A[k, ]))) == 0) {
                s[1, k] <- tol
                sensor <- 1
            } else {
                s[1, k] <- w[1, k]/norm(aux - t(as.matrix(A[k, ])), "F")
            }

        }
        auxant <- aux

        tdemu <- s %*% A/sum(s)
        rdemu <- s %*% A
        gamagama <- min(1, sensor, norm(rdemu, "F"))
        # print('imprimo s luego del ciclo:') print(s)
        aux <- (1 - gamagama) * tdemu + as.double(gamagama * aux)
        # print('Aux luego de la multiplicacion: ') print(aux)
        h <- (h + 1)

    }
    m <- aux

    return(m)
}

sqrtm <- function(x) {
    z <- x
    for (i in 1:ncol(x)) {
        for (j in 1:nrow(x)) {
            z[i, j] <- sqrt(as.complex(x[i, j]))
        }
    }
    return(z)
}



needs(igraph)
needs(geomorph)
needs(MASS)
needs(jsonlite)
attach(input[[1]])


result <- univMDSrobust(jsonlite::fromJSON(data),2)
json <- list(data = result, dimention = nrow(result),range =  max( max(result[,1]),max(result[,2])))
toJSON(json, pretty = TRUE, auto_unbox = TRUE)