// The Auth0 client, initialized in configureClient()
let auth0 = null;

/**
 * Starts the authentication flow
 */
const login = async (targetUrl) => {
  try {
    console.log("Logging in", targetUrl);

    const options = {
      redirect_uri: window.location.origin
    };

    if (targetUrl) {
      options.appState = { targetUrl };
    }

    await auth0.loginWithRedirect(options);
  } catch (err) {
    console.log("Log in failed", err);
  }
};

/**
 * Executes the logout flow
 */
const logout = () => {
  try {
    console.log("Logging out");
    auth0.logout({
      returnTo: window.location.origin
    });
  } catch (err) {
    console.log("Log out failed", err);
  }
};

/**
 * Retrieves the auth configuration from the server
 */
const fetchAuthConfig = () => fetch("/auth_config.json");

/**
 * Initializes the Auth0 client
 */
const configureClient = async () => {
  const response = await fetchAuthConfig();
  const config = await response.json();

  auth0 = await createAuth0Client({
    domain: config.domain,
    client_id: config.clientId,
    audience: config.audience,
    advancedOptions: {
      defaultScope: 'email'
    }
  });
};

/**
 * Checks to see if the user is authenticated. If so, `fn` is executed. Otherwise, the user
 * is prompted to log in
 * @param {*} fn The function to execute if the user is logged in
 */
const requireAuth = async (fn, targetUrl) => {
  const isAuthenticated = await auth0.isAuthenticated();

  if (isAuthenticated) {
    return fn();
  }

  return login(targetUrl);
};

/**
 * Calls the API endpoint with an authorization token
 */
const callApi = async () => {
  try {
    // const options = {
    //   scope: 'order:pizza'
    // }
    // const token = await auth0.getTokenSilently(options);

    // have to use a pop-up here in order to get user consent to access the "order pizza" permission
    const token = await auth0.getTokenWithPopup({
      scope: "order:pizza",
      audience: "https://api.mysite.com"
    });

    const responseElement = document.getElementById("api-call-result");

    const user = await auth0.getUser();
    
    // debug
    console.log(user)
    
    if (!user.email_verified) {
      responseElement.innerText = "You must verify your email prior to ordering a pizza! You may have to refresh the page.";
      // have to refresh page after doing this, I believe this is because the user token is cached,
      // so is not actually getting the user on each button press
      // the best way to resolve this is conditionally cache the user obj if the email is verified
    } else {
      const response = await fetch("/api/external/pizza", {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const responseData = await response.json();
      responseElement.innerText = JSON.stringify(responseData, {}, 2);

    }

    document.querySelectorAll("pre code").forEach(hljs.highlightBlock);

    eachElement(".result-block", (c) => c.classList.add("show"));
  } catch (e) {
    console.error(e);
  }
};

// Will run when page finishes loading
window.onload = async () => {
  await configureClient();

  // If unable to parse the history hash, default to the root URL
  if (!showContentFromUrl(window.location.pathname)) {
    showContentFromUrl("/");
    window.history.replaceState({ url: "/" }, {}, "/");
  }

  const bodyElement = document.getElementsByTagName("body")[0];

  // Listen out for clicks on any hyperlink that navigates to a #/ URL
  bodyElement.addEventListener("click", (e) => {
    if (isRouteLink(e.target)) {
      const url = e.target.getAttribute("href");

      if (showContentFromUrl(url)) {
        e.preventDefault();
        window.history.pushState({ url }, {}, url);
      }
    } else if (e.target.getAttribute("id") === "call-api") {
      e.preventDefault();
      callApi();
    }
  });

  const isAuthenticated = await auth0.isAuthenticated();

  if (isAuthenticated) {
    console.log("> User is authenticated");
    window.history.replaceState({}, document.title, window.location.pathname);
    updateUI();
    return;
  }

  console.log("> User not authenticated");

  const query = window.location.search;
  const shouldParseResult = query.includes("code=") && query.includes("state=");

  if (shouldParseResult) {
    console.log("> Parsing redirect");
    try {
      const result = await auth0.handleRedirectCallback();

      if (result.appState && result.appState.targetUrl) {
        showContentFromUrl(result.appState.targetUrl);
      }

      console.log("Logged in!");
    } catch (err) {
      console.log("Error parsing redirect:", err);
    }

    window.history.replaceState({}, document.title, "/");
  }

  updateUI();
};
