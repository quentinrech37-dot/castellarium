// auth-ui.js
// Gestion de l’interface de connexion / inscription
// Utilise window.castellariumAuth exposé par auth.js

function initAuthUI() {
    if (!window.castellariumAuth) {
        console.error("castellariumAuth n'est pas disponible. (initAuthUI)");
        return;
    }

    const {
        auth,
        signUp,
        signIn,
        signOut,
        onAuthStateChanged,
    } = window.castellariumAuth;

    let currentUser = null;

    // Récupération des éléments DOM
    const btnAccount       = document.getElementById("btnAccount");
    const authOverlay      = document.getElementById("authOverlay");
    const authCloseBtn     = document.getElementById("authCloseBtn");

    const tabSignIn        = document.getElementById("authTabSignIn");
    const tabSignUp        = document.getElementById("authTabSignUp");

    const formSignIn       = document.getElementById("authFormSignIn");
    const formSignUp       = document.getElementById("authFormSignUp");

    const signinEmail      = document.getElementById("signinEmail");
    const signinPassword   = document.getElementById("signinPassword");
    const signupEmail      = document.getElementById("signupEmail");
    const signupPassword   = document.getElementById("signupPassword");
    const signupPassword2  = document.getElementById("signupPassword2");

    const signinSubmit     = document.getElementById("signinSubmit");
    const signupSubmit     = document.getElementById("signupSubmit");

    const authMessage      = document.getElementById("authMessage");
    const loggedInBlock    = document.getElementById("authLoggedInBlock");
    const authUserInfo     = document.getElementById("authUserInfo");
    const btnLogout        = document.getElementById("btnLogout");

    // --- Helpers UI -------------------------------------------------------

    function showAuthModal(mode = "signin") {
        switchAuthMode(mode);
        authMessage.textContent = "";
        authMessage.classList.remove("auth-success");
        authOverlay.style.display = "flex";
    }

    function closeAuthModal() {
        authOverlay.style.display = "none";
    }

    function switchAuthMode(mode) {
        const isSignIn = mode === "signin";

        tabSignIn.classList.toggle("auth-tab-active", isSignIn);
        tabSignUp.classList.toggle("auth-tab-active", !isSignIn);

        formSignIn.style.display = isSignIn ? "flex" : "none";
        formSignUp.style.display = !isSignIn ? "flex" : "none";
    }

    function setLoading(button, isLoading) {
        if (!button) return;
        button.disabled = isLoading;
        if (isLoading) {
            button.dataset.originalText = button.textContent;
            button.textContent = "Patientez...";
        } else if (button.dataset.originalText) {
            button.textContent = button.dataset.originalText;
            delete button.dataset.originalText;
        }
    }

    function formatError(error) {
        if (!error || !error.code) return "Une erreur est survenue.";
        switch (error.code) {
            case "auth/email-already-in-use":
                return "Cette adresse e-mail est déjà utilisée.";
            case "auth/invalid-email":
                return "Adresse e-mail invalide.";
            case "auth/weak-password":
                return "Mot de passe trop faible (minimum 6 caractères).";
            case "auth/user-not-found":
            case "auth/wrong-password":
                return "E-mail ou mot de passe incorrect.";
            default:
                return error.message || "Erreur : " + error.code;
        }
    }

    function updateAccountButton() {
        if (!btnAccount) return;
        if (currentUser) {
            const email = currentUser.email || "";
            const short = email.split("@")[0];
            btnAccount.textContent = "👤 " + short;
        } else {
            btnAccount.textContent = "👤 Se connecter";
        }
    }

    function updateLoggedInBlock() {
        if (currentUser) {
            loggedInBlock.style.display = "block";
            authUserInfo.textContent =
                "Connecté en tant que " + (currentUser.email || "");
        } else {
            loggedInBlock.style.display = "none";
        }
    }

    // --- Évènements -------------------------------------------------------

    if (btnAccount) {
        btnAccount.addEventListener("click", () => {
            showAuthModal("signin");
        });
    }

    if (authCloseBtn) {
        authCloseBtn.addEventListener("click", closeAuthModal);
    }
    if (authOverlay) {
        authOverlay.addEventListener("click", (e) => {
            if (e.target === authOverlay) closeAuthModal();
        });
    }

    if (tabSignIn) {
        tabSignIn.addEventListener("click", () => switchAuthMode("signin"));
    }
    if (tabSignUp) {
        tabSignUp.addEventListener("click", () => switchAuthMode("signup"));
    }

    if (formSignIn) {
        formSignIn.addEventListener("submit", async (e) => {
            e.preventDefault();
            authMessage.textContent = "";
            authMessage.classList.remove("auth-success");

            const email = signinEmail.value.trim();
            const pass  = signinPassword.value;

            if (!email || !pass) {
                authMessage.textContent = "Merci de remplir tous les champs.";
                return;
            }

            setLoading(signinSubmit, true);
            try {
                await signIn(email, pass);
                authMessage.classList.add("auth-success");
                authMessage.textContent = "Connexion réussie.";
            } catch (err) {
                authMessage.classList.remove("auth-success");
                authMessage.textContent = formatError(err);
                console.error(err);
            } finally {
                setLoading(signinSubmit, false);
            }
        });
    }

    if (formSignUp) {
        formSignUp.addEventListener("submit", async (e) => {
            e.preventDefault();
            authMessage.textContent = "";
            authMessage.classList.remove("auth-success");

            const email = signupEmail.value.trim();
            const pass1 = signupPassword.value;
            const pass2 = signupPassword2.value;

            if (!email || !pass1 || !pass2) {
                authMessage.textContent = "Merci de remplir tous les champs.";
                return;
            }
            if (pass1 !== pass2) {
                authMessage.textContent = "Les mots de passe ne correspondent pas.";
                return;
            }

            setLoading(signupSubmit, true);
            try {
                await signUp(email, pass1);
                authMessage.classList.add("auth-success");
                authMessage.textContent = "Compte créé. Vous êtes connecté.";
            } catch (err) {
                authMessage.classList.remove("auth-success");
                authMessage.textContent = formatError(err);
                console.error(err);
            } finally {
                setLoading(signupSubmit, false);
            }
        });
    }

    if (btnLogout) {
        btnLogout.addEventListener("click", async () => {
            authMessage.textContent = "";
            authMessage.classList.remove("auth-success");
            try {
                await signOut();
            } catch (err) {
                authMessage.textContent = formatError(err);
                console.error(err);
            }
        });
    }

    // Suivi de l’état de connexion Firebase
    onAuthStateChanged((user) => {
        currentUser = user || null;
        updateAccountButton();
        updateLoggedInBlock();

        if (currentUser) {
            closeAuthModal();
        }
    });

    console.log("auth-ui.js initialisé, utilisateur courant :", auth.currentUser);
}

// ------------------------
// Lancement quand Firebase EST PRÊT
// ------------------------

// Si auth.js a déjà posé castellariumAuth
if (window.castellariumAuth) {
    initAuthUI();
} else {
    // Sinon on attend l’événement envoyé par auth.js
    window.addEventListener("castellariumAuthReady", () => {
        initAuthUI();
    }, { once: true });
}
