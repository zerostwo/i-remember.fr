(function () {
  var params = {};
  var query = window.location.search.replace(/^\?/, "").split("&");
  for (var i = 0; i < query.length; i += 1) {
    if (!query[i]) continue;
    var pair = query[i].split("=");
    params[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1] || "1");
  }

  var deterministic = params.qaDeterministic === "1";
  try {
    Object.defineProperty(window, "devicePixelRatio", {
      configurable: true,
      get: function () {
        return 1;
      }
    });
  } catch (error) {
    window.devicePixelRatio = 1;
  }

  window.I_REMEMBER_REVIVAL = {
    deterministic: deterministic,
    seed: parseInt(params.qaSeed || "20140430", 10),
    devicePixelRatio: 1
  };

  function localOrigin() {
    if (window.location.origin) return window.location.origin;
    return window.location.protocol + "//" + window.location.host;
  }

  Array.prototype.forEach.call(document.querySelectorAll("base"), function (base) {
    base.setAttribute("href", localOrigin() + "/");
  });

  document.documentElement.setAttribute(
    "data-revival-deterministic",
    deterministic ? "true" : "false"
  );

  if (deterministic) {
    var seed = window.I_REMEMBER_REVIVAL.seed >>> 0;
    Math.random = function () {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  }

  if (window.HTMLMediaElement && HTMLMediaElement.prototype.play) {
    var originalMediaPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      var result = originalMediaPlay.apply(this, arguments);
      if (result && typeof result.catch === "function") {
        return result.catch(function () {});
      }
      return result;
    };
  }

  window.addEventListener("unhandledrejection", function (event) {
    var reason = event.reason || {};
    var message = String(reason.message || reason);
    if (
      reason.name === "NotAllowedError" &&
      message.indexOf("play() failed") !== -1
    ) {
      event.preventDefault();
    }
  });

  function closest(element, selector) {
    while (element && element.nodeType === 1) {
      if (element.matches && element.matches(selector)) return element;
      element = element.parentNode;
    }
    return null;
  }

  function transformProperty() {
    if (window.Modernizr && Modernizr.prefixed) {
      return Modernizr.prefixed("transform");
    }
    return "transform";
  }

  function setCreditVisible(visible) {
    var credit = document.querySelector(".credit");
    var wrapper = document.querySelector(".credit-wrapper");
    if (!credit || !wrapper) return;

    var transform = transformProperty();
    if (visible) {
      credit.style.display = "block";
      wrapper.style[transform] = "translate3d(0,0,0)";
      Array.prototype.forEach.call(
        credit.querySelectorAll(".bss-inner > *"),
        function (element) {
          element.style.opacity = "1";
          element.style[transform] = "translate3d(0,0,0)";
        }
      );
      return;
    }

    wrapper.style[transform] = "translate3d(332px,0,0)";
    window.setTimeout(function () {
      credit.style.display = "none";
    }, 350);
  }

  function localSocialImage() {
    return localOrigin() + "/uploads/posts/revival-upload/resized.jpg";
  }

  function localSocialThumb() {
    return localOrigin() + "/uploads/posts/revival-upload/thumb.jpg";
  }

  function facebookPhotoPayload() {
    var image = localSocialImage();
    var thumb = localSocialThumb();
    return {
      id: "revival-photo",
      name: "I Remember",
      source: image,
      picture: thumb,
      images: [
        { width: 540, height: 540, source: image },
        { width: 320, height: 320, source: thumb }
      ]
    };
  }

  function ensureFacebookMock() {
    if (window.FB && window.FB.__iRememberRevivalMock) return window.FB;

    window.FB = {
      __iRememberRevivalMock: true,
      init: function () {},
      getLoginStatus: function (callback) {
        window.setTimeout(function () {
          callback({
            authResponse: {
              userID: "revival-user",
              accessToken: "revival-token"
            }
          });
        }, 0);
      },
      login: function (callback) {
        window.setTimeout(function () {
          callback({
            authResponse: {
              userID: "revival-user",
              accessToken: "revival-token"
            }
          });
        }, 0);
      },
      api: function (path, callback) {
        window.setTimeout(function () {
          callback(facebookPhotoPayload());
        }, 0);
      }
    };

    return window.FB;
  }

  function facebookAlbumsPayload() {
    return {
      data: [
        {
          id: "revival-album",
          name: "I Remember",
          cover_photo: "revival-photo"
        }
      ],
      paging: { cursors: {} }
    };
  }

  function facebookPhotosPayload() {
    return {
      data: [facebookPhotoPayload()],
      paging: { cursors: {} }
    };
  }

  function instagramUserPayload() {
    return { data: { id: "revival-user" } };
  }

  function instagramPhotosPayload() {
    return {
      data: [
        {
          type: "image",
          caption: { text: "I Remember" },
          images: {
            low_resolution: { url: localSocialThumb() },
            standard_resolution: { url: localSocialImage() }
          }
        }
      ],
      pagination: {}
    };
  }

  function localSocialPayload(url) {
    if (url.indexOf("graph.facebook.com") !== -1) {
      if (url.indexOf("/albums") !== -1) return facebookAlbumsPayload();
      if (url.indexOf("/photos") !== -1) return facebookPhotosPayload();
      return facebookPhotoPayload();
    }

    if (url.indexOf("api.instagram.com") !== -1) {
      if (url.indexOf("/media/recent") !== -1) return instagramPhotosPayload();
      return instagramUserPayload();
    }

    return null;
  }

  function blockedExternalScriptType(url) {
    var value = String(url || "").toLowerCase();
    if (value.indexOf("google-analytics.com/ga.js") !== -1) return "ga";
    if (value.indexOf("connect.facebook.net") !== -1 && value.indexOf("/all.js") !== -1) {
      return "facebook";
    }
    return "";
  }

  function isExternalUrl(url) {
    try {
      var parsed = new URL(String(url || ""), window.location.href);
      return parsed.origin !== window.location.origin;
    } catch (error) {
      return false;
    }
  }

  function localApiUrl(url) {
    try {
      var parsed = new URL(String(url || ""), window.location.href);
      if (parsed.origin !== window.location.origin) return "";
      if (!/^\/api(?:\/|$)/.test(parsed.pathname)) return "";
      return parsed.href;
    } catch (error) {
      return "";
    }
  }

  function appendQueryData(url, data) {
    var parsed;
    var params;
    var key;

    if (!data) return url;
    parsed = new URL(url, window.location.href);
    params = new URLSearchParams(parsed.search);

    if (typeof data === "string") {
      new URLSearchParams(data).forEach(function (value, name) {
        params.set(name, value);
      });
    } else if (Object.prototype.toString.call(data) === "[object Object]") {
      for (key in data) {
        if (Object.prototype.hasOwnProperty.call(data, key) && data[key] != null) {
          params.set(key, data[key]);
        }
      }
    }

    parsed.search = params.toString();
    return parsed.href;
  }

  function parseAjaxPayload(text) {
    var match;
    try {
      return JSON.parse(text);
    } catch (error) {
      match = String(text || "").match(/^[\w$.]+\(([\s\S]*)\);?$/);
      if (match) return JSON.parse(match[1]);
      throw error;
    }
  }

  function localApiAjax(settings) {
    var method = String(settings.type || settings.method || "GET").toUpperCase();
    var url = localApiUrl(settings.url);
    var path;
    var requestUrl;
    var requestOptions;
    var jqxhr;
    var aborted = false;

    if (!url) return null;
    path = new URL(url).pathname;
    if (
      !(
        (method === "GET" && /^\/api\/(?:search-posts|auto-complete-tags|related-post-count)(?:\/|$)/.test(path)) ||
        (method === "POST" && path === "/api/upload-image")
      )
    ) {
      return null;
    }

    requestUrl = method === "GET" ? appendQueryData(url, settings.data) : url;
    requestOptions = {
      credentials: "same-origin",
      method: method
    };
    if (method !== "GET") requestOptions.body = settings.data || null;
    jqxhr = {
      abort: function () {
        aborted = true;
      },
      readyState: 1,
      status: 0
    };

    fetch(requestUrl, requestOptions)
      .then(function (response) {
        return response.text().then(function (text) {
          return {
            response: response,
            text: text,
            payload: parseAjaxPayload(text)
          };
        });
      })
      .then(function (result) {
        if (aborted) return;
        jqxhr.readyState = 4;
        jqxhr.status = result.response.status;
        jqxhr.responseText = result.text;
        jqxhr.responseJSON = result.payload;
        if (!result.response.ok) throw result;
        if (settings.success) settings.success(result.payload, "success", jqxhr);
        if (settings.complete) settings.complete(jqxhr, "success");
      })
      .catch(function (error) {
        if (aborted) return;
        jqxhr.readyState = 4;
        jqxhr.status = error.response ? error.response.status : 0;
        jqxhr.responseJSON = error.payload || null;
        jqxhr.responseText = error.text || "";
        if (settings.error) settings.error(jqxhr, "error", error);
        if (settings.complete) settings.complete(jqxhr, "error");
      });

    return jqxhr;
  }

  function completeScriptNode(node) {
    node.readyState = "complete";
    if (typeof node.onload === "function") node.onload();
    if (typeof node.onreadystatechange === "function") node.onreadystatechange();
  }

  function patchJqueryAjax() {
    var jq = window.jQuery || window.$;
    if (!jq || !jq.ajax || jq.ajax.__iRememberRevivalPatched) return false;

    var originalAjax = jq.ajax;
    jq.ajax = function (options) {
      var settings =
        typeof options === "string"
          ? { url: options }
          : options || {};
      var dataType = String(settings.dataType || "").toLowerCase();
      var payload = settings.url ? localSocialPayload(settings.url) : null;
      var localApiRequest = settings.url ? localApiAjax(settings) : null;

      if (localApiRequest) return localApiRequest;

      if (!payload) {
        if (
          isExternalUrl(settings.url) &&
          (dataType === "jsonp" ||
            dataType === "script" ||
            /(?:\?|&)callback=\?/.test(String(settings.url || "")))
        ) {
          window.setTimeout(function () {
            if (settings.error) settings.error({ status: 400 }, "error", "blocked_script_request");
            if (settings.complete) settings.complete({ status: 400 }, "error");
          }, 0);
          return {
            abort: function () {},
            readyState: 4,
            status: 400
          };
        }
        return originalAjax.apply(this, arguments);
      }

      window.setTimeout(function () {
        if (settings.success) settings.success(payload);
        if (settings.complete) settings.complete({ status: 200 }, "success");
      }, 120);

      return {
        abort: function () {},
        readyState: 4,
        status: 200
      };
    };
    jq.ajax.__iRememberRevivalPatched = true;
    return true;
  }

  function safeMergeValue(value, seen) {
    var key;
    var output;

    if (!value || typeof value !== "object") return value;
    if (value.nodeType || value === window || value === document) return value;

    seen = seen || [];
    if (seen.indexOf(value) !== -1) return value;
    seen.push(value);

    if (Object.prototype.toString.call(value) === "[object Array]") {
      output = [];
      for (var i = 0; i < value.length; i += 1) {
        output[i] = safeMergeValue(value[i], seen);
      }
      return output;
    }

    output = {};
    for (key in value) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
      if (key === "__proto__" || key === "prototype" || key === "constructor") continue;
      output[key] = safeMergeValue(value[key], seen);
    }
    return output;
  }

  function patchLegacyJquerySecurity() {
    var jq = window.jQuery || window.$;
    if (!jq || jq.__iRememberSecurityPatched) return false;

    if (jq.extend && !jq.extend.__iRememberSecurityPatched) {
      var originalExtend = jq.extend;
      jq.extend = jq.fn.extend = function () {
        var args = Array.prototype.slice.call(arguments);
        if (args[0] === true) {
          for (var i = 1; i < args.length; i += 1) {
            args[i] = safeMergeValue(args[i], []);
          }
        }
        return originalExtend.apply(this, args);
      };
      jq.extend.__iRememberSecurityPatched = true;
    }

    if (jq.parseHTML && !jq.parseHTML.__iRememberSecurityPatched) {
      var originalParseHTML = jq.parseHTML;
      jq.parseHTML = function (html, context) {
        return originalParseHTML.call(this, html, context, false);
      };
      jq.parseHTML.__iRememberSecurityPatched = true;
    }

    jq.__iRememberSecurityPatched = true;
    return true;
  }

  function installJquerySecurityHook() {
    if (window.__REVIVAL_JQUERY_SECURITY_HOOKED__) return;
    window.__REVIVAL_JQUERY_SECURITY_HOOKED__ = true;

    ["jQuery", "$"].forEach(function (name) {
      var current = window[name];
      try {
        Object.defineProperty(window, name, {
          configurable: true,
          get: function () {
            return current;
          },
          set: function (value) {
            current = value;
            patchLegacyJquerySecurity();
          }
        });
      } catch (error) {
        current = window[name];
      }
    });
  }

  function jsonpCallbackName(url) {
    var match = String(url).match(/[?&](?:callback|jsonp)=([^&#]+)/);
    if (!match) return null;
    return decodeURIComponent(match[1]);
  }

  function isExternalScript(url) {
    if (!url) return false;
    try {
      return new URL(String(url), localOrigin()).origin !== localOrigin();
    } catch (error) {
      return true;
    }
  }

  function patchJsonpScriptInsertion() {
    if (window.__REVIVAL_SOCIAL_JSONP_PATCHED__) return true;
    var originalAppendChild = Node.prototype.appendChild;
    var originalInsertBefore = Node.prototype.insertBefore;

    function intercept(node) {
      if (!node || !node.tagName || node.tagName.toLowerCase() !== "script") {
        return false;
      }

      var blockedType = blockedExternalScriptType(node.src);
      if (blockedType) {
        window.setTimeout(function () {
          if (blockedType === "facebook") {
            ensureFacebookMock();
            if (typeof window.fbAsyncInit === "function") window.fbAsyncInit();
          }
          completeScriptNode(node);
        }, 0);
        return true;
      }

      var payload = node.src ? localSocialPayload(node.src) : null;
      if (!payload) {
        if (jsonpCallbackName(node.src) || isExternalScript(node.src)) {
          window.setTimeout(function () {
            completeScriptNode(node);
          }, 0);
          return true;
        }
        return false;
      }

      window.setTimeout(function () {
        var callbackName = jsonpCallbackName(node.src);
        if (callbackName && typeof window[callbackName] === "function") {
          window[callbackName](payload);
        }

        completeScriptNode(node);
      }, 120);

      return true;
    }

    Node.prototype.appendChild = function (node) {
      if (intercept(node)) return node;
      return originalAppendChild.apply(this, arguments);
    };

    Node.prototype.insertBefore = function (node) {
      if (intercept(node)) return node;
      return originalInsertBefore.apply(this, arguments);
    };

    window.__REVIVAL_SOCIAL_JSONP_PATCHED__ = true;
    return true;
  }

  try {
    var assignedFacebookInit;
    Object.defineProperty(window, "fbAsyncInit", {
      configurable: true,
      get: function () {
        return assignedFacebookInit;
      },
      set: function (callback) {
        assignedFacebookInit = callback;
        window.setTimeout(function () {
          ensureFacebookMock();
          if (typeof callback === "function") callback();
        }, 0);
      }
    });
  } catch (error) {
    ensureFacebookMock();
  }

  var socialPatchAttempts = 0;
  ensureFacebookMock();
  patchJsonpScriptInsertion();

  var socialPatchTimer = window.setInterval(function () {
    socialPatchAttempts += 1;
    ensureFacebookMock();
    patchJsonpScriptInsertion();
    if (document.querySelector(".app.show")) {
      patchLegacyJquerySecurity();
      installJquerySecurityHook();
    }
    var patched = patchJqueryAjax();
    if (document.querySelector(".app.show") && (patched || window.__REVIVAL_SOCIAL_JSONP_PATCHED__)) {
      window.clearInterval(socialPatchTimer);
      return;
    }

    if (socialPatchAttempts > 120) {
      window.clearInterval(socialPatchTimer);
    }
  }, 100);

  function siteLanguage() {
    if (window.LANG === "fr" || window.LANG === "zh" || window.LANG === "en") return window.LANG;
    if (window.location.pathname.indexOf("/fr") === 0) return "fr";
    if (window.location.pathname.indexOf("/zh") === 0) return "zh";
    return "en";
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function fetchJson(url) {
    if (!window.fetch) return Promise.reject(new Error("fetch_unavailable"));
    return window.fetch(url, { credentials: "same-origin" }).then(function (response) {
      return response.json().then(function (payload) {
        if (!response.ok || !payload || payload.success === false) {
          throw new Error(payload && (payload.message || payload.errorMsg) || "request_failed");
        }
        return payload.data;
      });
    });
  }

  function setTermsVisible(visible) {
    var terms = document.querySelector(".terms");
    var wrapper = document.querySelector(".terms-wrapper");
    if (!terms || !wrapper) return;

    var transform = transformProperty();
    if (visible) {
      terms.style.display = "block";
      wrapper.style[transform] = "translate3d(0,0,0)";
      return;
    }

    wrapper.style[transform] = "translate3d(332px,0,0)";
    window.setTimeout(function () {
      terms.style.display = "none";
    }, 350);
  }

  function ensureManagedMenuStyles() {
    if (document.getElementById("revival-managed-menu-styles")) return;
    var style = document.createElement("style");
    style.id = "revival-managed-menu-styles";
    style.textContent = [
      ".footer-content[data-managed-menu='true']>.footer-link-donate:not(.footer-managed-item),.footer-content[data-managed-menu='true']>.footer-link-terms:not(.footer-managed-item),.footer-content[data-managed-menu='true']>.footer-link-credits:not(.footer-managed-item){display:none!important}",
      ".footer-content[data-managed-menu='true']{display:flex;align-items:flex-end;justify-content:flex-end;gap:10px 18px;padding:0 50px 26px 20px;flex-wrap:wrap}",
      ".footer-content[data-managed-menu='true']>*{float:none!important;margin-left:0!important}",
      ".footer-content[data-managed-menu='true']>.footer-managed-item{display:block!important;margin-top:0!important;white-space:nowrap}",
      ".footer-content[data-managed-menu='true']>.footer-link-lang{margin-top:0!important;position:relative}",
      ".footer-content[data-managed-menu='true']>.footer-logo-wrapper{margin:0 0 0 16px!important}",
      ".footer-content[data-managed-menu='true']>.footer-share,.footer-content[data-managed-menu='true']>.footer-sound-btn{margin-top:0!important}",
      ".footer[data-managed-menu='true']>.footer-link-donate:not(.footer-managed-item),.footer[data-managed-menu='true']>.footer-link-terms:not(.footer-managed-item),.footer[data-managed-menu='true']>.footer-link-credits:not(.footer-managed-item){display:none!important}",
      ".footer[data-managed-menu='true']>.footer-managed-item{display:block!important}",
      ".revival-menu-memory{position:fixed;inset:0;z-index:40;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.36);pointer-events:auto}",
      ".revival-menu-memory.is-visible{display:flex}",
      ".revival-menu-card{width:min(620px,calc(100vw - 44px));max-height:calc(100vh - 120px);display:grid;grid-template-columns:220px minmax(0,1fr);border:1px solid rgba(255,255,255,.2);background:rgba(0,0,0,.92);color:white;box-shadow:0 22px 70px rgba(0,0,0,.72);transform:translate3d(0,16px,0) scale(.98);opacity:0;transition:opacity .42s linear,transform .42s ease}",
      ".revival-menu-memory.is-visible .revival-menu-card{opacity:1;transform:scale(1)}",
      ".revival-menu-image{min-height:286px;background:#151515 center/cover;border-right:1px solid rgba(255,255,255,.14)}",
      ".revival-menu-body{padding:28px;overflow:auto}",
      ".revival-menu-body h2{font-family:'ITC Century W01 Bold',Georgia,serif;font-size:28px;line-height:1.12;margin:0 0 14px}",
      ".revival-menu-body p{font-family:'ITC Century W01 Book',Georgia,serif;color:rgba(255,255,255,.68);line-height:1.68;margin:0 0 16px}",
      ".revival-menu-full{display:none;border-top:1px solid rgba(255,255,255,.16);margin-top:18px;padding-top:18px}",
      ".revival-menu-memory.is-expanded .revival-menu-full{display:block}",
      ".revival-menu-actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:20px}",
      ".revival-menu-actions button,.revival-menu-actions a{border:1px solid rgba(255,255,255,.24);border-radius:999px;background:transparent;color:white;cursor:pointer;font:12px Helvetica,Arial,sans-serif;min-height:36px;padding:0 16px;text-decoration:none;text-transform:uppercase}",
      ".revival-menu-close{position:absolute;right:22px;top:18px;border:0;background:transparent;color:white;cursor:pointer;font-size:30px;line-height:1;opacity:.72}",
      "@media(max-width:760px){.footer-content[data-managed-menu='true']{align-content:flex-end;gap:8px 12px;padding:0 20px 18px}.footer-content[data-managed-menu='true']>.footer-share,.footer-content[data-managed-menu='true']>.footer-sound-btn{display:none!important}.footer-content[data-managed-menu='true']>.footer-logo-wrapper{width:42px;height:50px}.footer-content[data-managed-menu='true']>.footer-managed-item{font-size:9px}}",
      "@media(max-width:720px){.revival-menu-card{grid-template-columns:1fr;max-height:calc(100vh - 80px)}.revival-menu-image{min-height:190px;border-right:0;border-bottom:1px solid rgba(255,255,255,.18)}.revival-menu-body{padding:22px}.revival-menu-body h2{font-size:25px}}"
    ].join("");
    document.head.appendChild(style);
  }

  function footerItemElement(item) {
    var element;
    if (item.type === "EXTERNAL") {
      element = document.createElement("a");
      element.href = item.url || "#";
      if (item.opensNewTab) {
        element.target = "_blank";
        element.rel = "noopener noreferrer";
      }
    } else {
      element = document.createElement("div");
      element.tabIndex = 0;
    }

    element.className = "footer-link-item footer-fade-item footer-managed-item";
    element.textContent = item.label;
    element.setAttribute("data-menu-id", item.id);
    element.setAttribute("data-menu-type", item.type);
    element.setAttribute("data-menu-label", item.label);
    return element;
  }

  function renderManagedFooter(items) {
    ensureManagedMenuStyles();
    var footer = document.querySelector(".footer-content");
    var footerShell = document.querySelector(".footer");
    var language = document.querySelector(".footer-link-lang");
    if (!footer || !language || !items || !items.length) return;
    footer.setAttribute("data-managed-menu", "true");
    if (footerShell) footerShell.setAttribute("data-managed-menu", "true");

    Array.prototype.forEach.call(
      footer.querySelectorAll(".footer-managed-item"),
      function (node) {
        node.parentNode.removeChild(node);
      }
    );

    Array.prototype.forEach.call(
      footer.querySelectorAll(".footer-link-donate,.footer-link-terms,.footer-link-credits"),
      function (node) {
        node.style.display = "none";
      }
    );

    var languageItem = items.filter(function (item) {
      return item.type === "LANGUAGE";
    })[0];
    if (languageItem) {
      language.style.display = "";
      var text = language.querySelector(".footer-link-lang-text");
      if (text) text.textContent = languageItem.label;
    } else {
      language.style.display = "none";
    }

    var managed = items.filter(function (item) {
      return item.type !== "LANGUAGE";
    });
    var anchor = language;
    for (var i = managed.length - 1; i >= 0; i -= 1) {
      var element = footerItemElement(managed[i]);
      footer.insertBefore(element, anchor.nextSibling);
      anchor = element;
    }
  }

  function showFooterSearchToken(label) {
    var wrapper = document.querySelector(".nav-search-wrapper");
    var item = document.querySelector(".nav-search-item");
    var text = document.querySelector(".nav-search-item-text");
    var line = document.querySelector(".nav-search-item-line");
    if (!wrapper || !item || !text || !line) return;
    wrapper.classList.add("has-item");
    item.style.display = "block";
    item.style.opacity = "1";
    text.textContent = label;
    line.style.width = item.offsetWidth + "px";
  }

  function legacyModule(name) {
    return window.requirejs && window.requirejs._defined
      ? window.requirejs._defined[name]
      : null;
  }

  function showLegacySearchResults(payload) {
    var scene = legacyModule("scene3dController");
    var ui = legacyModule("uiController");
    var posts = [];
    if (payload && payload.post) posts.push(payload.post);
    if (!posts.length && payload && payload.results) posts = payload.results;
    if (!scene || !scene.showSearchedPosts || !posts.length) return false;
    if (ui && ui.hidePost2d) ui.hidePost2d();
    scene.showSearchedPosts(posts);
    return true;
  }

  function hideFooterSearchToken() {
    var wrapper = document.querySelector(".nav-search-wrapper");
    var item = document.querySelector(".nav-search-item");
    if (wrapper) wrapper.classList.remove("has-item");
    if (item) item.style.opacity = "0";
  }

  function ensureMenuMemoryOverlay() {
    ensureManagedMenuStyles();
    var overlay = document.querySelector(".revival-menu-memory");
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.className = "revival-menu-memory";
    overlay.innerHTML = [
      '<button class="revival-menu-close" type="button" aria-label="Close">×</button>',
      '<article class="revival-menu-card">',
      '<div class="revival-menu-image"></div>',
      '<div class="revival-menu-body">',
      '<h2></h2>',
      '<p class="revival-menu-excerpt"></p>',
      '<div class="revival-menu-full"></div>',
      '<div class="revival-menu-actions">',
      '<button class="revival-menu-read" type="button">Read more</button>',
      '<a class="revival-menu-permalink" target="_blank" rel="noopener noreferrer">Open memory</a>',
      '</div>',
      '</div>',
      '</article>'
    ].join("");
    document.body.appendChild(overlay);
    return overlay;
  }

  function renderMenuMemory(payload) {
    var memory = payload && payload.memory;
    var page = payload && payload.page;
    if (!memory && page) {
      memory = {
        title: page.title,
        excerpt: page.excerpt,
        bodyHtml: page.bodyHtml,
        imageUrl: "/uploads/posts/revival-upload/thumb.jpg",
        publicUrl: "#"
      };
    }
    if (!memory) return;

    var overlay = ensureMenuMemoryOverlay();
    overlay.classList.remove("is-expanded");
    overlay.querySelector(".revival-menu-image").style.backgroundImage =
      "url('" + String(memory.imageUrl || "/uploads/posts/revival-upload/thumb.jpg").replace(/'/g, "%27") + "')";
    overlay.querySelector("h2").textContent = memory.title || "I Remember";
    overlay.querySelector(".revival-menu-excerpt").textContent = memory.excerpt || memory.text || "";
    overlay.querySelector(".revival-menu-full").innerHTML = memory.bodyHtml || "<p>" + escapeHtml(memory.bodyMarkdown || memory.text || "") + "</p>";
    var permalink = overlay.querySelector(".revival-menu-permalink");
    permalink.href = memory.publicUrl || "#";
    permalink.style.display = memory.publicUrl ? "" : "none";
    overlay.classList.add("is-visible");
  }

  function renderMenuMemoryAfterSearch(payload) {
    var navigated = showLegacySearchResults(payload);
    window.setTimeout(function () {
      renderMenuMemory(payload);
    }, navigated ? 850 : 120);
  }

  function closeMenuMemory() {
    var overlay = document.querySelector(".revival-menu-memory");
    if (overlay) {
      overlay.classList.remove("is-visible", "is-expanded");
    }
    hideFooterSearchToken();
  }

  function normalizeSearchTag(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\u200b/g, "")
      .replace(/[-!$%^&*()_+|~=`{}\[\]:";'<>?,.\/\s]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function searchInputText() {
    var input = document.querySelector(".search-input");
    var value = input ? input.textContent || "" : "";
    return value.replace(/\u200b/g, "").trim();
  }

  function setSearchFallbackNav(tagName) {
    var search = document.querySelector(".search");
    var applyVisibleState = function () {
      var nav = document.querySelector(".nav");
      var wrapper = document.querySelector(".nav-search-wrapper");
      var item = document.querySelector(".nav-search-item");
      var itemText = document.querySelector(".nav-search-item-text");
      var line = document.querySelector(".nav-search-item-line");

      if (nav) nav.style.display = "block";
      if (wrapper) wrapper.classList.add("has-item");
      if (itemText) itemText.textContent = tagName;
      if (item) {
        item.style.display = "block";
        item.style.opacity = "1";
      }
      if (line) {
        line.style.width = item ? Math.max(item.offsetWidth, itemText ? itemText.offsetWidth : 0, 44) + "px" : "100%";
      }
    };

    applyVisibleState();
    window.setTimeout(applyVisibleState, 80);
    window.setTimeout(applyVisibleState, 650);
    if (search) {
      search.classList.remove("not-found");
      search.style.opacity = "0";
      search.style.display = "none";
    }
  }

  function showSearchFallbackNoResult(tagName) {
    var search = document.querySelector(".search");
    var message = document.querySelector(".search-not-found");
    if (!search) return;
    if (message) {
      message.innerHTML = message.innerHTML.replace(/\{\{interpolation\}\}/g, escapeHtml(tagName));
      message.style.opacity = "1";
    }
    search.classList.add("not-found");
    search.style.display = "block";
    search.style.opacity = "1";
  }

  function submitSearchFallback() {
    var raw = searchInputText();
    var tag = normalizeSearchTag(raw);
    var url;

    if (!tag) return false;
    url =
      "/api/search-posts/" +
      encodeURIComponent(tag) +
      "?ln=" +
      encodeURIComponent(siteLanguage()) +
      "&tagName=" +
      encodeURIComponent(raw);

    window.fetch(url, { credentials: "same-origin" })
      .then(function (response) {
        return response.json();
      })
      .then(function (payload) {
        var posts =
          payload && payload.success && payload.data && payload.data.posts
            ? payload.data.posts
            : [];
        if (posts.length > 0) {
          setSearchFallbackNav(raw || tag);
        } else {
          showSearchFallbackNoResult(raw || tag);
        }
      })
      .catch(function () {
        showSearchFallbackNoResult(raw || tag);
      });

    return true;
  }

  function installSearchFallback() {
    document.addEventListener(
      "click",
      function (event) {
        if (!closest(event.target, ".search-btn")) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.stopImmediatePropagation) event.stopImmediatePropagation();
        submitSearchFallback();
      },
      true
    );

    document.addEventListener(
      "keydown",
      function (event) {
        if (event.key !== "Enter" || !closest(event.target, ".search-input")) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.stopImmediatePropagation) event.stopImmediatePropagation();
        submitSearchFallback();
      },
      true
    );
  }

  function uploadStillLoading() {
    var loading = document.querySelector(".add-steps-upload-methods-loading");
    if (!loading) return false;
    var style = window.getComputedStyle ? window.getComputedStyle(loading) : loading.style;
    return style.display !== "none" && Number(style.opacity || 0) > 0.15;
  }

  function advanceLegacyUpload(fileId) {
    var steps = legacyModule("stepController");
    if (!steps) return;
    steps.data = steps.data || {};
    steps.data.fileId = fileId;
    var image = new Image();
    image.onload = function () {
      steps.data.image = image;
      if (steps.goToStep) steps.goToStep("adjustment");
    };
    image.src = "/uploads/tmp/" + encodeURIComponent(fileId) + "/resized.jpg";
    if (image.width && image.onload) image.onload();
  }

  function fallbackUploadLocalFile(input) {
    var file = input && input.files && input.files[0];
    if (!file || input.__revivalUploadFallbackActive) return;
    input.__revivalUploadFallbackActive = true;
    window.setTimeout(function () {
      var steps = legacyModule("stepController");
      if (steps && steps.data && steps.data.fileId) {
        input.__revivalUploadFallbackActive = false;
        return;
      }
      if (!uploadStillLoading()) {
        input.__revivalUploadFallbackActive = false;
        return;
      }
      var form = new FormData();
      form.append("local", file);
      form.append("ln", siteLanguage());
      window.fetch("/api/upload-image", {
        method: "POST",
        body: form,
        credentials: "same-origin"
      })
        .then(function (response) {
          return response.json();
        })
        .then(function (payload) {
          if (payload && payload.success && payload.data && payload.data.fileId) {
            advanceLegacyUpload(payload.data.fileId);
          }
        })
        .catch(function () {})
        .then(function () {
          input.__revivalUploadFallbackActive = false;
        });
    }, 3200);
  }

  function installUploadWatchdog() {
    document.addEventListener("change", function (event) {
      if (event.target && event.target.id === "local-upload") {
        fallbackUploadLocalFile(event.target);
      }
    }, true);
  }

  function loadManagedFooter() {
    fetchJson("/api/public/menu?ln=" + encodeURIComponent(siteLanguage()))
      .then(function (data) {
        renderManagedFooter(data.items || []);
      })
      .catch(function () {});
  }

  loadManagedFooter();
  installSearchFallback();
  installUploadWatchdog();

  document.addEventListener(
    "click",
    function (event) {
      var managedItem = closest(event.target, ".footer-managed-item[data-menu-id]");
      if (managedItem) {
        var type = managedItem.getAttribute("data-menu-type");
        if (type === "EXTERNAL") return;
        event.preventDefault();
        event.stopPropagation();

        if (type === "LANGUAGE") return;
        if (type === "TERMS") {
          setTermsVisible(true);
          return;
        }
        if (type === "CREDITS") {
          setCreditVisible(true);
          return;
        }

        showFooterSearchToken(managedItem.getAttribute("data-menu-label") || managedItem.textContent);
        fetchJson(
          "/api/public/menu-target/" +
            encodeURIComponent(managedItem.getAttribute("data-menu-id")) +
            "?ln=" +
            encodeURIComponent(siteLanguage())
        )
          .then(renderMenuMemoryAfterSearch)
          .catch(function () {
            hideFooterSearchToken();
          });
        return;
      }

      if (
        closest(event.target, ".revival-menu-close") ||
        event.target === document.querySelector(".revival-menu-memory")
      ) {
        event.preventDefault();
        event.stopPropagation();
        closeMenuMemory();
        return;
      }

      if (closest(event.target, ".revival-menu-read")) {
        event.preventDefault();
        event.stopPropagation();
        var overlay = document.querySelector(".revival-menu-memory");
        if (overlay) overlay.classList.toggle("is-expanded");
        return;
      }

      if (closest(event.target, ".footer-link-credits")) {
        event.preventDefault();
        event.stopPropagation();
        setCreditVisible(true);
        return;
      }

      if (
        closest(event.target, ".credit-close-btn") ||
        event.target === document.querySelector(".credit")
      ) {
        event.preventDefault();
        event.stopPropagation();
        setCreditVisible(false);
        return;
      }

      if (
        closest(event.target, ".terms-close-btn") ||
        event.target === document.querySelector(".terms")
      ) {
        event.preventDefault();
        event.stopPropagation();
        setTermsVisible(false);
      }
    },
    true
  );
}());
