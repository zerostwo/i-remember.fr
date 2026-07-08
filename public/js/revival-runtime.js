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
    devicePixelRatio: 1,
    introFastForward: false,
    introFastForwardComplete: false,
    introAppInitialized: false
  };

  var languagePreferenceKey = "iRememberLanguage";
  var uiCopy = {
    en: {
      htmlLang: "en-US",
      footerLanguage: "language",
      header: 'How lucky we are to be able to say <span class="font-italic">&laquo;I remember&raquo;</span>.<br/>Let\'s share our memories to fight Alzheimer\'s disease.',
      navSearch: "Search for a memory",
      navAdd: "Add a memory",
      searchPlaceholder: "Search...",
      searchNotFound: 'No memory match your search &lt;&lt;<span class="font-bold-italic">{{interpolation}}</span>&gt;&gt;.<br/>Please make an other search.',
      shareMemory: 'tell a<br/><span class="font-light-italic">memory</span>',
      lookMemory: 'see all <span class="font-italic">memories</span>',
      acceptTerms: "I have read and agree with the",
      termsLink: "Terms of Service",
      tutorialMoveMouse: '<span class="font-italic">Use your mouse</span><br/><span>to move</span>',
      tutorialMoveTouch: '<span class="font-italic">Touch and drag</span><br/><span>to move</span>',
      tutorialZoomTouch: '<span class="font-italic">Pinch or double tap</span><br/><span>to zoom in</span>',
      tutorialWatchTouch: '<span class="font-italic">Tap to watch</span><br/><span>a memory</span>'
    },
    fr: {
      htmlLang: "fr-FR",
      footerLanguage: "langue",
      header: 'Quelle chance nous avons de pouvoir dire <span class="font-italic">&laquo;je me souviens&raquo;</span>.<br/>Partageons nos souvenirs pour lutter contre Alzheimer.',
      navSearch: "Rechercher un souvenir",
      navAdd: "Ajouter un souvenir",
      searchPlaceholder: "Rechercher...",
      searchNotFound: 'Aucun souvenir ne correspond a &lt;&lt;<span class="font-bold-italic">{{interpolation}}</span>&gt;&gt;.<br/>Veuillez essayer une autre recherche.',
      shareMemory: 'raconter un<br/><span class="font-light-italic">souvenir</span>',
      lookMemory: 'voir tous les <span class="font-italic">souvenirs</span>',
      acceptTerms: "J'ai lu et j'accepte les",
      termsLink: "conditions d'utilisation",
      tutorialMoveMouse: '<span class="font-italic">Utilisez votre souris</span><br/>pour vous <span class="font-italic">deplacer</span>',
      tutorialMoveTouch: '<span class="font-italic">Touchez et glissez</span><br/>pour vous <span class="font-italic">deplacer</span>',
      tutorialZoomTouch: '<span class="font-italic">Pincez ou touchez deux fois</span><br/><span class="font-italic">pour zoomer</span>',
      tutorialWatchTouch: '<span class="font-italic">Touchez</span> un souvenir<br/>pour <span class="font-italic">le voir</span>'
    },
    zh: {
      htmlLang: "zh-CN",
      footerLanguage: "语言",
      header: '能说出 <span class="font-italic">“我记得”</span> 是多么幸运。<br/>分享你的回忆，一起守护记忆。',
      navSearch: "搜索回忆",
      navAdd: "添加回忆",
      searchPlaceholder: "搜索...",
      searchNotFound: '没有回忆匹配 &lt;&lt;<span class="font-bold-italic">{{interpolation}}</span>&gt;&gt;。<br/>请换一个词搜索。',
      shareMemory: '说出<br/><span class="font-light-italic">一段回忆</span>',
      lookMemory: '查看所有<span class="font-italic">回忆</span>',
      acceptTerms: "我已阅读并同意",
      termsLink: "服务条款",
      tutorialMoveMouse: '<span class="font-italic">移动鼠标</span><br/><span>探索回忆</span>',
      tutorialMoveTouch: '<span class="font-italic">触摸并拖动</span><br/><span>探索回忆</span>',
      tutorialZoomTouch: '<span class="font-italic">双指缩放或双击</span><br/><span>放大</span>',
      tutorialWatchTouch: '<span class="font-italic">轻点查看</span><br/><span>一段回忆</span>'
    }
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

  function panelWidth(wrapper) {
    var width;
    if (wrapper && wrapper.getBoundingClientRect) {
      width = wrapper.getBoundingClientRect().width;
    }
    if (!width && window.getComputedStyle) {
      width = parseFloat(
        window.getComputedStyle(document.documentElement).getPropertyValue("--revival-panel-width")
      );
    }
    return Math.ceil(width || 332);
  }

  function hiddenPanelTransform(wrapper) {
    return "translate3d(" + panelWidth(wrapper) + "px,0,0)";
  }

  function setPanelWidth(value) {
    var max = Math.min(Math.max(window.innerWidth - 24, 300), 720);
    var width = Math.max(300, Math.min(max, Math.round(value)));
    document.documentElement.style.setProperty("--revival-panel-width", width + "px");
    try {
      window.sessionStorage.setItem("iRememberPanelWidth", String(width));
    } catch (error) {}
  }

  function restorePanelWidth() {
    var saved;
    try {
      saved = parseInt(window.sessionStorage.getItem("iRememberPanelWidth") || "", 10);
    } catch (error) {}
    if (saved) setPanelWidth(saved);
  }

  function ensurePanelResize(wrapper) {
    if (!wrapper || wrapper.__revivalResizeReady) return;
    wrapper.__revivalResizeReady = true;
    var handle = document.createElement("div");
    var tracking = false;
    handle.className = "revival-panel-resize";
    handle.setAttribute("aria-hidden", "true");
    wrapper.appendChild(handle);

    function clientX(event) {
      return event.touches && event.touches[0] ? event.touches[0].clientX : event.clientX;
    }

    function move(event) {
      if (!tracking) return;
      setPanelWidth(window.innerWidth - clientX(event));
      event.preventDefault();
    }

    function up() {
      tracking = false;
      document.removeEventListener("mousemove", move, true);
      document.removeEventListener("mouseup", up, true);
      document.removeEventListener("touchmove", move, true);
      document.removeEventListener("touchend", up, true);
    }

    function down(event) {
      tracking = true;
      document.addEventListener("mousemove", move, true);
      document.addEventListener("mouseup", up, true);
      document.addEventListener("touchmove", move, { capture: true, passive: false });
      document.addEventListener("touchend", up, true);
      event.preventDefault();
    }

    handle.addEventListener("mousedown", down, true);
    handle.addEventListener("touchstart", down, { capture: true, passive: false });
  }

  function installPanelResizers() {
    restorePanelWidth();
    ensurePanelResize(document.querySelector(".terms-wrapper"));
    ensurePanelResize(document.querySelector(".credit-wrapper"));
  }

  function setCreditVisible(visible) {
    var credit = document.querySelector(".credit");
    var wrapper = document.querySelector(".credit-wrapper");
    var items;
    if (!credit || !wrapper) return;

    var transform = transformProperty();
    installPanelResizers();
    if (visible) {
      credit.style.display = "block";
      wrapper.style[transform] = "translate3d(0,0,0)";
      items = credit.querySelectorAll(".bss-inner > *");
      Array.prototype.forEach.call(items, function (element, index) {
        element.style.opacity = "0";
        element.style[transform] = "translate3d(0,30px,0)";
        window.setTimeout(function () {
          element.style.opacity = "1";
          element.style[transform] = "translate3d(0,0,0)";
        }, 100 * index);
      });
      return;
    }

    wrapper.style[transform] = hiddenPanelTransform(wrapper);
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

  var uploadImageInFlight = 0;

  function isLegacyMainScript(url) {
    try {
      var parsed = new URL(String(url || ""), window.location.href);
      return parsed.origin === window.location.origin && /\/js\/main\.js$/.test(parsed.pathname);
    } catch (error) {
      return false;
    }
  }

  function patchLegacyMainSource(source) {
    var marker = 'define.amd={jQuery:!0}})(),define("../../build/almond"';
    var replacement =
      'define.amd={jQuery:!0}})(),window.__REVIVAL_REQUIREJS__=requirejs,' +
      'window.__REVIVAL_REQUIRE__=require,window.__REVIVAL_DEFINE__=define,' +
      'define("../../build/almond"';
    if (source.indexOf(marker) === -1) return source;
    return source.replace(marker, replacement);
  }

  function installPatchedLegacyMain(node, parent, referenceNode, originalInsertBefore, originalAppendChild) {
    if (window.__REVIVAL_PATCHED_MAIN_LOADING__) return false;
    window.__REVIVAL_PATCHED_MAIN_LOADING__ = true;

    window.fetch(node.src, { credentials: "same-origin" })
      .then(function (response) {
        if (!response.ok) throw new Error("main_load_failed");
        return response.text();
      })
      .then(function (source) {
        var script = document.createElement("script");
        script.text = patchLegacyMainSource(source) + "\n//# sourceURL=" + node.src.split("#")[0];
        if (parent && referenceNode) {
          originalInsertBefore.call(parent, script, referenceNode);
        } else if (parent) {
          originalAppendChild.call(parent, script);
        } else {
          document.head.appendChild(script);
        }
        completeScriptNode(node);
      })
      .catch(function () {
        node.setAttribute("data-revival-main-fallback", "true");
        if (parent && referenceNode) {
          originalInsertBefore.call(parent, node, referenceNode);
        } else if (parent) {
          originalAppendChild.call(parent, node);
        } else {
          document.head.appendChild(node);
        }
      });

    return true;
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
    var isUploadImageRequest;
    var releaseUploadImageInflight;
    var jqxhr;
    var aborted = false;

    if (!url) return null;
    path = new URL(url).pathname;
    if (
      !(
        (method === "GET" && /^\/api\/(?:search-posts|auto-complete-tags|related-post-count)(?:\/|$)/.test(path)) ||
        (method === "POST" && (path === "/api/upload-image" || path === "/api/post"))
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
    isUploadImageRequest = method === "POST" && path === "/api/upload-image";
    if (isUploadImageRequest) {
      uploadImageInFlight += 1;
      window.__REVIVAL_UPLOAD_REQUESTS__ = uploadImageInFlight;
      releaseUploadImageInflight = function () {
        if (uploadImageInFlight > 0) uploadImageInFlight -= 1;
        window.__REVIVAL_UPLOAD_REQUESTS__ = uploadImageInFlight;
      };
    }
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
      })
      .then(function () {
        if (releaseUploadImageInflight) releaseUploadImageInflight();
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

    function intercept(node, parent, referenceNode) {
      if (!node || !node.tagName || node.tagName.toLowerCase() !== "script") {
        return false;
      }

      if (
        isLegacyMainScript(node.src) &&
        !node.getAttribute("data-revival-main-fallback")
      ) {
        return installPatchedLegacyMain(
          node,
          parent,
          referenceNode,
          originalInsertBefore,
          originalAppendChild
        );
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
      if (intercept(node, this, null)) return node;
      return originalAppendChild.apply(this, arguments);
    };

    Node.prototype.insertBefore = function (node) {
      if (intercept(node, this, arguments[1] || null)) return node;
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
    var preferred = preferredLanguage();
    if (preferred) return preferred;
    if (window.LANG === "fr" || window.LANG === "zh" || window.LANG === "en") return window.LANG;
    if (window.location.pathname.indexOf("/fr") === 0) return "fr";
    if (window.location.pathname.indexOf("/zh") === 0) return "zh";
    return "en";
  }

  function normalizedLanguage(language) {
    return language === "fr" || language === "zh" || language === "en" ? language : "en";
  }

  function preferredLanguage() {
    var stored;
    try {
      stored = window.sessionStorage.getItem(languagePreferenceKey);
    } catch (error) {}
    return stored === "fr" || stored === "zh" || stored === "en" ? stored : "";
  }

  function setPreferredLanguage(language) {
    var normalized = normalizedLanguage(language);
    try {
      window.sessionStorage.setItem(languagePreferenceKey, normalized);
    } catch (error) {}
    window.LANG = normalized;
    return normalized;
  }

  function isTouchDevice() {
    return (
      "ontouchstart" in window ||
      (window.matchMedia && window.matchMedia("(pointer: coarse)").matches)
    );
  }

  function setText(selector, text) {
    var element = document.querySelector(selector);
    if (element) element.textContent = text;
  }

  function setHtml(selector, html) {
    var element = document.querySelector(selector);
    if (element) element.innerHTML = html;
  }

  function applyInputModeText() {
    var copy = uiCopy[siteLanguage()] || uiCopy.en;
    var pages = document.querySelectorAll(".tutorial-page-text");
    if (!pages.length) return;

    if (isTouchDevice()) {
      document.documentElement.classList.add("is-touch-device");
      if (pages[0]) pages[0].innerHTML = copy.tutorialMoveTouch;
      if (pages[1]) pages[1].innerHTML = copy.tutorialZoomTouch;
      if (pages[2]) pages[2].innerHTML = copy.tutorialWatchTouch;
      return;
    }

    if (pages[0]) pages[0].innerHTML = copy.tutorialMoveMouse;
  }

  function applyLanguagePreference() {
    var language = siteLanguage();
    var copy = uiCopy[language] || uiCopy.en;
    var config = legacyModule("config");

    window.LANG = language;
    if (config) config.LANG = language;
    document.documentElement.lang = copy.htmlLang;
    document.documentElement.setAttribute("data-revival-language", language);

    setHtml(".header-description", copy.header);
    setText(".nav-search-text", copy.navSearch);
    setText(".nav-add-text", copy.navAdd);
    setText(".search-input-placeholder", copy.searchPlaceholder);
    setHtml(".add-steps-add-options-share-text", copy.shareMemory);
    setHtml(".add-steps-add-options-look-text", copy.lookMemory);
    setText(".add-steps-message-terms-i-accept-text", copy.acceptTerms);
    setText(".add-steps-message-terms-link", copy.termsLink);

    var notFound = document.querySelector(".search-not-found");
    if (notFound) {
      var searchOverlay = document.querySelector(".search");
      notFound.setAttribute("data-template", copy.searchNotFound);
      if (!searchOverlay || !searchOverlay.classList.contains("not-found")) {
        notFound.innerHTML = copy.searchNotFound.replace(/\{\{interpolation\}\}/g, "");
      }
    }

    var label = document.querySelector(".footer-link-lang-text");
    if (label && !closest(label, ".footer-content[data-managed-menu='true']")) {
      label.textContent = copy.footerLanguage;
    }
    Array.prototype.forEach.call(document.querySelectorAll(".footer-link-lang-item[data-id]"), function (item) {
      item.classList.toggle("selected", item.getAttribute("data-id") === language);
    });
    applyInputModeText();
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
    installPanelResizers();
    if (visible) {
      terms.style.display = "block";
      wrapper.style[transform] = "translate3d(0,0,0)";
      return;
    }

    wrapper.style[transform] = hiddenPanelTransform(wrapper);
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
      ".footer-content[data-managed-menu='true']>.footer-managed-item{display:block!important;float:right!important;white-space:nowrap}",
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
      "html{--revival-panel-width:332px}",
      ".terms-wrapper,.credit-wrapper{width:var(--revival-panel-width,332px)!important;max-width:calc(100vw - 24px)!important;background:#000!important}",
      ".terms-close-btn,.credit-close-btn{position:absolute!important;top:18px!important;margin:0!important;z-index:3}",
      ".terms-close-btn{left:-16px!important}",
      ".credit-close-btn{left:18px!important}",
      ".terms-wrapper .scroll-move-container{left:34px!important;width:calc(100% - 68px)!important;padding-top:58px!important}",
      ".terms-wrapper .scroll-indicator-wrapper{width:6px!important;background:#1e1e1e!important}",
      ".terms-wrapper .scroll-indicator{border-radius:4px;background:#5f5f5f!important}",
      ".credit-wrapper .bss-inner{padding:86px 34px 34px!important;text-align:left!important}",
      ".credit-title,.credit-item,.credit-item-text{max-width:100%!important}",
      ".revival-panel-resize{position:absolute;left:0;top:0;width:12px;height:100%;cursor:ew-resize;z-index:2}",
      ".nav{width:118px!important}",
      ".nav-map-wrapper{margin-bottom:18px!important}",
      ".nav-search-wrapper,.nav-add-wrapper{clear:both!important;margin-top:14px!important;margin-bottom:14px!important}",
      "html.is-touch-device .base-3d-container,html.is-touch-device .app{touch-action:none}",
      "html.revival-empty-memory .add-steps-add-options-look,html.revival-empty-memory .nav-map-wrapper{display:none!important;pointer-events:none!important}",
      "@media(max-width:760px){.header-description{display:none!important}.header-logo{left:22px!important;top:28px!important;transform:scale(.72)!important;transform-origin:left top!important}.header-fade-container{right:16px!important;top:12px!important;transform:scale(.76)!important;transform-origin:right top!important}.nav{left:8px!important;width:72px!important;margin-top:-78px!important}.nav-map-wrapper{left:0!important;width:62px!important;height:62px!important;margin:8px 0 8px auto!important}.nav-map-btn{width:62px!important;height:62px!important}.nav-search-wrapper,.nav-add-wrapper{margin:8px 0 8px auto!important}.nav-text,.nav-search-item{left:52px!important}.search-center-wrapper{left:20px!important;right:20px!important;width:auto!important;margin-left:0!important;margin-top:-58px!important}.search-input-wrapper,.search-line{width:100%!important}.search-input,.search-input-placeholder{font-size:50px!important;line-height:58px!important;max-width:100%!important;white-space:nowrap!important}.search-not-found{left:0!important;width:100%!important;font-size:15px!important;line-height:22px!important}.search-btn{right:0!important}.footer{height:132px!important}.footer-content{height:132px!important;display:flex!important;align-items:flex-end!important;justify-content:flex-end!important;gap:8px 12px!important;flex-wrap:wrap!important;padding:0 16px 18px 16px!important}.footer-content>*{float:none!important;margin:0!important}.footer-logo-wrapper{order:20;width:46px!important;height:54px!important}.footer-share,.footer-sound-btn{width:24px!important;height:24px!important}.footer-link-item{font-size:9px!important;line-height:14px!important;white-space:nowrap!important}.footer-link-lang-list{bottom:18px!important}.terms-wrapper,.credit-wrapper{width:100vw!important;max-width:100vw!important}.revival-panel-resize{display:none!important}}",
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
    var runtimeRequire = window.__REVIVAL_REQUIREJS__ || window.requirejs;
    return runtimeRequire && runtimeRequire._defined
      ? runtimeRequire._defined[name]
      : null;
  }

  function ensureIntroFastForwardStyles() {
    if (document.getElementById("revival-intro-fast-forward-styles")) return;
    var style = document.createElement("style");
    style.id = "revival-intro-fast-forward-styles";
    style.textContent = [
      "html.is-intro-fast-forward .preloader{cursor:pointer}",
      "html.is-intro-fast-forward .preloader .preloader-text-line{display:none!important;opacity:0!important}",
      "html.is-intro-fast-forward .preloader[data-fast-forward-phase='first'] .preloader-text-line-1,html.is-intro-fast-forward .preloader[data-fast-forward-phase='first'] .preloader-text-line-2{display:block!important;opacity:.5!important}",
      "html.is-intro-fast-forward .preloader[data-fast-forward-phase='second'] .preloader-text-line-3,html.is-intro-fast-forward .preloader[data-fast-forward-phase='second'] .preloader-text-line-4{display:block!important;opacity:.5!important}",
      "html.is-intro-fast-forward-complete .preloader{display:none!important}"
    ].join("");
    document.head.appendChild(style);
  }

  function elementIsVisible(element) {
    var rect;
    var style;
    if (!element) return false;
    style = window.getComputedStyle ? window.getComputedStyle(element) : element.style;
    if (style.display === "none" || style.visibility === "hidden") return false;
    rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function preloaderIsActive() {
    var preloader = document.querySelector(".preloader");
    return elementIsVisible(preloader) && !window.I_REMEMBER_REVIVAL.introFastForwardComplete;
  }

  function setIntroFastForwardPhase(phase) {
    var preloader = document.querySelector(".preloader");
    if (!preloader) return;
    preloader.setAttribute("data-fast-forward-phase", phase);
  }

  function wrapLegacyAppInit(ui) {
    if (!ui || typeof ui._appInitFunc !== "function" || ui._revivalIntroInitWrapped) return;
    var originalInit = ui._appInitFunc;
    ui._appInitFunc = function () {
      if (window.I_REMEMBER_REVIVAL.introAppInitialized) return null;
      window.I_REMEMBER_REVIVAL.introAppInitialized = true;
      return originalInit.apply(this, arguments);
    };
    ui._revivalIntroInitWrapped = true;
  }

  function legacyAssetsReadyForIntroExit() {
    var config = legacyModule("config");
    var preloader = legacyModule("preloaderController");
    if (!config || !preloader || !preloader.getLoadedItemByURL) return false;
    return !!preloader.getLoadedItemByURL(config.uiAssetPath);
  }

  function runLegacyIntroAppInit() {
    var ui = legacyModule("uiController");
    if (!ui || typeof ui._appInitFunc !== "function") return false;
    if (!legacyAssetsReadyForIntroExit()) return false;
    wrapLegacyAppInit(ui);
    ui._appInitFunc();
    return true;
  }

  function introReadyForExit() {
    if (!document.querySelector(".app.show")) return false;
    if (window.I_REMEMBER_REVIVAL.introAppInitialized) return true;
    return (
      elementIsVisible(document.querySelector(".add-steps-add-options")) ||
      elementIsVisible(document.querySelector(".post-2d"))
    );
  }

  function completeIntroFastForward() {
    var preloader = document.querySelector(".preloader");
    if (window.I_REMEMBER_REVIVAL.introFastForwardComplete) return;
    window.I_REMEMBER_REVIVAL.introFastForwardComplete = true;
    document.documentElement.classList.remove("is-intro-fast-forward");
    document.documentElement.classList.add("is-intro-fast-forward-complete");
    document.documentElement.setAttribute("data-intro-fast-forward", "complete");
    if (preloader) {
      preloader.removeAttribute("data-fast-forward-phase");
      preloader.style.display = "none";
    }
  }

  function pollIntroFastForward(startTime) {
    if (!window.I_REMEMBER_REVIVAL.introFastForward) return;

    if (runLegacyIntroAppInit() && introReadyForExit()) {
      completeIntroFastForward();
      return;
    }

    if (+(new Date()) - startTime > 12000) return;
    window.setTimeout(function () {
      pollIntroFastForward(startTime);
    }, 80);
  }

  function startIntroFastForward() {
    if (window.I_REMEMBER_REVIVAL.introFastForward || !preloaderIsActive()) return false;
    window.I_REMEMBER_REVIVAL.introFastForward = true;
    ensureIntroFastForwardStyles();
    document.documentElement.classList.add("is-intro-fast-forward");
    document.documentElement.setAttribute("data-intro-fast-forward", "requested");
    setIntroFastForwardPhase("first");
    window.setTimeout(function () {
      setIntroFastForwardPhase("second");
    }, 220);
    window.setTimeout(function () {
      pollIntroFastForward(+(new Date()));
    }, 560);
    return true;
  }

  function installIntroFastForward() {
    function handlePointer(event) {
      if (event.type !== "keydown" && !closest(event.target, ".preloader")) return;
      if (!startIntroFastForward()) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.stopImmediatePropagation) event.stopImmediatePropagation();
    }

    document.addEventListener("click", handlePointer, true);
    document.addEventListener("touchstart", handlePointer, true);
    document.addEventListener(
      "keydown",
      function (event) {
        if (event.key !== "Enter" && event.key !== " ") return;
        handlePointer(event);
      },
      true
    );
  }

  function showLegacySearchResults(payload) {
    var scene = legacyModule("scene3dController");
    var ui = legacyModule("uiController");
    var posts = [];
    if (payload && payload.post) posts.push(payload.post);
    if (!posts.length && payload && payload.data && payload.data.posts) {
      posts = payload.data.posts;
    }
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
      if (!message.getAttribute("data-template")) message.setAttribute("data-template", message.innerHTML);
      message.innerHTML = message.getAttribute("data-template").replace(/\{\{interpolation\}\}/g, escapeHtml(tagName));
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
          try {
            showLegacySearchResults({ data: { posts: posts } });
          } catch (error) {}
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
    var input = legacyModule("inputController");
    if (!steps) return;
    steps.data = steps.data || {};
    steps.data.fileId = fileId;
    if (input && input.unlock) input.unlock("upload-image");
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
      var inputController = legacyModule("inputController");
      if (steps && steps.data && steps.data.fileId) {
        input.__revivalUploadFallbackActive = false;
        return;
      }
      if ((window.__REVIVAL_UPLOAD_REQUESTS__ || 0) > 0) {
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
          } else if (inputController && inputController.unlock) {
            inputController.unlock("upload-image");
          }
        })
        .catch(function () {
          if (inputController && inputController.unlock) {
            inputController.unlock("upload-image");
          }
        })
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

  function touchBridgeIgnored(target) {
    return closest(
      target,
      "a,button,input,textarea,select,[contenteditable],.footer,.search,.terms,.credit,.add-steps,.revival-menu-memory"
    );
  }

  function dispatchMouseFromTouch(type, touch, target, detail) {
    var event;
    if (!touch || !target || typeof window.MouseEvent !== "function") return;
    event = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      view: window,
      detail: detail || 1,
      screenX: touch.screenX,
      screenY: touch.screenY,
      clientX: touch.clientX,
      clientY: touch.clientY
    });
    target.dispatchEvent(event);
  }

  function installTouchInteraction() {
    var activeTarget = null;
    var lastTap = 0;
    if (!isTouchDevice() || window.I_REMEMBER_REVIVAL.touchInteractionReady) return;
    window.I_REMEMBER_REVIVAL.touchInteractionReady = true;
    document.documentElement.classList.add("is-touch-device");

    document.addEventListener("touchstart", function (event) {
      var touch = event.touches && event.touches[0];
      var now = +(new Date());
      var detail = now - lastTap < 320 ? 2 : 1;
      if (!touch || touchBridgeIgnored(event.target)) return;
      activeTarget = event.target;
      lastTap = now;
      dispatchMouseFromTouch("mousedown", touch, activeTarget, detail);
      if (detail === 2) dispatchMouseFromTouch("dblclick", touch, activeTarget, detail);
      event.preventDefault();
    }, { capture: true, passive: false });

    document.addEventListener("touchmove", function (event) {
      var touch = event.touches && event.touches[0];
      if (!activeTarget || !touch) return;
      dispatchMouseFromTouch("mousemove", touch, activeTarget, 1);
      event.preventDefault();
    }, { capture: true, passive: false });

    document.addEventListener("touchend", function (event) {
      var touch = event.changedTouches && event.changedTouches[0];
      if (!activeTarget || !touch) return;
      dispatchMouseFromTouch("mouseup", touch, activeTarget, 1);
      dispatchMouseFromTouch("click", touch, activeTarget, 1);
      activeTarget = null;
    }, true);

    document.addEventListener("touchcancel", function () {
      activeTarget = null;
    }, true);
  }

  function applyEmptyMemoryState() {
    var posts = window.DEFAULT_POSTS && window.DEFAULT_POSTS.data && window.DEFAULT_POSTS.data.posts;
    if (!posts || posts.length > 0) return;
    ensureManagedMenuStyles();
    document.documentElement.classList.add("revival-empty-memory");
  }

  function loadManagedFooter() {
    fetchJson("/api/public/menu?ln=" + encodeURIComponent(siteLanguage()))
      .then(function (data) {
        renderManagedFooter(data.items || []);
        applyLanguagePreference();
      })
      .catch(function () {});
  }

  applyLanguagePreference();
  loadManagedFooter();
  installPanelResizers();
  installTouchInteraction();
  applyEmptyMemoryState();
  document.addEventListener("DOMContentLoaded", function () {
    applyLanguagePreference();
    installPanelResizers();
    installTouchInteraction();
    applyEmptyMemoryState();
  });
  window.setTimeout(applyLanguagePreference, 800);
  window.setTimeout(applyLanguagePreference, 1800);
  installIntroFastForward();
  installSearchFallback();
  installUploadWatchdog();

  document.addEventListener(
    "click",
    function (event) {
      var languageItem = closest(event.target, ".footer-link-lang-item[data-id]");
      if (languageItem) {
        event.preventDefault();
        event.stopPropagation();
        if (event.stopImmediatePropagation) event.stopImmediatePropagation();
        setPreferredLanguage(languageItem.getAttribute("data-id"));
        applyLanguagePreference();
        loadManagedFooter();
        return;
      }

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
