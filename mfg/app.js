"use strict";

(() => {
  const byId = (id) => document.getElementById(id);
  const readButton = byId("read-button");
  const downloadButton = byId("download-button");
  const pageStatus = byId("page-status");
  const dialog = byId("password-dialog");
  const form = byId("password-form");
  const passwordInput = byId("password-input");
  const dialogTitle = byId("dialog-title");
  const dialogDescription = byId("dialog-description");
  const dialogStatus = byId("dialog-status");
  const unlockButton = byId("unlock-button");
  const cancelButton = byId("cancel-button");
  const viewer = byId("viewer");
  const closeReader = byId("close-reader");
  const canvasStage = byId("canvas-stage");
  const canvas = byId("pdf-canvas");
  const pageText = byId("page-text");
  const readerStatus = byId("reader-status");
  const previousPage = byId("previous-page");
  const nextPage = byId("next-page");
  const pageForm = byId("page-form");
  const pageNumber = byId("page-number");
  const pageTotal = byId("page-total");
  const goPage = byId("go-page");
  const zoomOut = byId("zoom-out");
  const zoomIn = byId("zoom-in");
  const zoomValue = byId("zoom-value");
  const fitWidth = byId("fit-width");
  const utf8 = new TextEncoder();
  const downloadUrls = new Set();
  const minimumZoom = 0.35;
  const maximumZoom = 3;
  let vault = null;
  let selectedAction = null;
  let requestController = null;
  let operationId = 0;
  let busy = false;
  let pdfLibraryPromise = null;
  let readingSession = null;
  let readerCleanup = Promise.resolve();
  let resizeTimer = null;

  function status(element, message, kind = "info") {
    element.textContent = message;
    element.dataset.kind = kind;
  }

  function decodeBase64(value) {
    if (typeof value !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
      throw new Error("Invalid vault encoding");
    }
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  }

  function validateVault(value) {
    if (value?.version !== 1 || value.kdf?.name !== "PBKDF2" ||
        value.kdf.hash !== "SHA-256" || !Number.isInteger(value.kdf.iterations) ||
        value.kdf.iterations < 100000 || value.kdf.iterations > 2000000 ||
        value.cipher?.name !== "AES-GCM" || value.cipher.tagLength !== 128) {
      throw new Error("Unsupported vault configuration");
    }
    const salt = decodeBase64(value.kdf.salt);
    if (salt.length < 16 || salt.length > 64) throw new Error("Invalid salt");
    for (const action of ["read", "download"]) {
      const expectedFile = action === "read" ? "reading.bin" : "download.bin";
      if (value[action]?.file !== expectedFile || decodeBase64(value[action].iv).length !== 12) {
        throw new Error("Invalid document configuration");
      }
    }
    return value;
  }

  async function fetchChecked(file, signal) {
    const response = await fetch(file, { cache: "no-store", credentials: "omit", signal });
    if (!response.ok) throw new Error(`Document request failed (${response.status})`);
    return response;
  }

  function setBusy(value) {
    busy = value;
    unlockButton.disabled = value;
    passwordInput.disabled = value;
    form.setAttribute("aria-busy", String(value));
  }

  function isCurrentReader(session, renderId) {
    return readingSession === session && !session.closed &&
      (renderId === undefined || session.renderId === renderId);
  }

  function setReaderControls(session, rendering = false) {
    const unavailable = !session || rendering;
    previousPage.disabled = unavailable || session.pageNumber <= 1;
    nextPage.disabled = unavailable || session.pageNumber >= session.document.numPages;
    pageNumber.disabled = unavailable;
    goPage.disabled = unavailable;
    zoomOut.disabled = unavailable || session.actualScale <= minimumZoom;
    zoomIn.disabled = unavailable || session.actualScale >= maximumZoom;
    fitWidth.disabled = unavailable;
    if (session) {
      pageNumber.max = String(session.document.numPages);
      pageNumber.value = String(session.pageNumber);
      pageTotal.textContent = `/ ${session.document.numPages} 页`;
    }
  }

  function clearCanvas() {
    canvas.width = 1;
    canvas.height = 1;
    canvas.style.width = "0px";
    canvas.style.height = "0px";
    canvas.setAttribute("aria-label", "PDF 页面未解锁");
    pageText.replaceChildren();
    pageText.setAttribute("aria-label", "本页文字");
  }

  function closeReading() {
    const session = readingSession;
    readingSession = null;
    viewer.hidden = true;
    viewer.setAttribute("aria-busy", "false");
    setReaderControls(null);
    status(readerStatus, "");
    zoomValue.textContent = "—";
    if (session) {
      session.closed = true;
      session.renderId += 1;
      session.renderTask?.cancel();
      // The loading task owns the document and worker after getDocument().
      // Destroy it before clearing any remaining, possibly transferred bytes.
      const destruction = session.loadingTask
        ? session.loadingTask.destroy()
        : Promise.resolve();
      const renderFinished = session.renderTask?.promise ?? Promise.resolve();
      const sessionCleanup = Promise.allSettled([destruction, renderFinished]).then(() => {
        if (session.bytes?.byteLength) session.bytes.fill(0);
        session.bytes = null;
        session.document = null;
        session.loadingTask = null;
        session.renderTask = null;
      });
      readerCleanup = Promise.allSettled([readerCleanup, sessionCleanup]).then(() => undefined);
    }
    clearCanvas();
    return readerCleanup;
  }

  function cancelOperation() {
    const openingReader = busy && selectedAction === "read";
    operationId += 1;
    requestController?.abort();
    requestController = null;
    passwordInput.value = "";
    selectedAction = null;
    setBusy(false);
    if (openingReader) closeReading();
    if (dialog.open) dialog.close();
  }

  function askPassword(action) {
    if (!vault || busy) return;
    if (action === "read") closeReading();
    selectedAction = action;
    passwordInput.value = "";
    status(dialogStatus, "");
    dialogTitle.textContent = action === "read" ? "输入密码 · 在线阅读" : "输入密码 · 下载笔记";
    dialogDescription.textContent = action === "read"
      ? "请输入密码以在线阅读笔记。"
      : "下载后打开 PDF 时，也需输入同一密码。";
    unlockButton.textContent = action === "read" ? "确认阅读" : "确认下载";
    dialog.showModal();
    passwordInput.focus();
  }

  async function decrypt(action, password, signal) {
    const encrypted = await (await fetchChecked(vault[action].file, signal)).arrayBuffer();
    const encodedPassword = utf8.encode(password);
    let passwordKey;
    try {
      passwordKey = await crypto.subtle.importKey("raw", encodedPassword, "PBKDF2", false, ["deriveKey"]);
    } finally {
      encodedPassword.fill(0);
    }
    const key = await crypto.subtle.deriveKey({
      name: "PBKDF2",
      hash: vault.kdf.hash,
      iterations: vault.kdf.iterations,
      salt: decodeBase64(vault.kdf.salt),
    }, passwordKey, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    if (signal.aborted) throw new DOMException("Operation cancelled", "AbortError");
    return crypto.subtle.decrypt({
      name: "AES-GCM",
      iv: decodeBase64(vault[action].iv),
      tagLength: vault.cipher.tagLength,
      additionalData: utf8.encode(`mfg-notes-v1:${action}`),
    }, key, encrypted);
  }

  async function getPdfLibrary() {
    if (!pdfLibraryPromise) {
      pdfLibraryPromise = import("./vendor/pdfjs/pdf.mjs").then((library) => {
        library.GlobalWorkerOptions.workerSrc = "./vendor/pdfjs/pdf.worker.mjs";
        return library;
      }).catch((error) => {
        pdfLibraryPromise = null;
        throw error;
      });
    }
    return pdfLibraryPromise;
  }

  async function renderPage(session) {
    if (!isCurrentReader(session)) return false;
    const thisRender = ++session.renderId;
    const targetPage = session.pageNumber;
    const previousTask = session.renderTask;
    previousTask?.cancel();
    session.renderTask = null;
    session.rendering = true;
    setReaderControls(session, true);
    viewer.setAttribute("aria-busy", "true");
    status(readerStatus, `正在显示第 ${targetPage} 页…`);
    pageText.replaceChildren();
    try {
      if (previousTask) await previousTask.promise.catch(() => undefined);
      if (!isCurrentReader(session, thisRender)) return false;
      const page = await session.document.getPage(targetPage);
      if (!isCurrentReader(session, thisRender)) return false;
      const baseViewport = page.getViewport({ scale: 1 });
      const availableWidth = Math.max(1, canvasStage.clientWidth);
      const scale = session.zoom === null ? availableWidth / baseViewport.width : session.zoom;
      const viewport = page.getViewport({ scale });
      const pixelRatio = Math.min(globalThis.devicePixelRatio || 1, 2);
      session.actualScale = scale;
      session.renderedWidth = availableWidth;
      canvas.width = Math.max(1, Math.floor(viewport.width * pixelRatio));
      canvas.height = Math.max(1, Math.floor(viewport.height * pixelRatio));
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      canvas.setAttribute("aria-label", `MFG 入门笔记，第 ${targetPage} 页，共 ${session.document.numPages} 页`);
      const renderTask = page.render({
        canvas,
        viewport,
        transform: pixelRatio === 1 ? null : [pixelRatio, 0, 0, pixelRatio, 0, 0],
        background: "rgb(255, 255, 255)",
      });
      session.renderTask = renderTask;
      await renderTask.promise;
      if (!isCurrentReader(session, thisRender)) return false;
      let text = "本页没有可提取的文字。";
      try {
        const content = await page.getTextContent();
        const extracted = content.items
          .filter((item) => typeof item.str === "string")
          .map((item) => item.str + (item.hasEOL ? "\n" : " ")).join("").trim();
        if (extracted) text = extracted;
      } catch {
        // Canvas reading remains available for pages without extractable text.
      }
      if (!isCurrentReader(session, thisRender)) return false;
      pageText.textContent = text;
      pageText.setAttribute("aria-label", `第 ${targetPage} 页文字`);
      zoomValue.textContent = `${Math.round(scale * 100)}%`;
      status(readerStatus, `第 ${targetPage} / ${session.document.numPages} 页${session.zoom === null ? " · 已适应宽度" : ""}`);
      return true;
    } catch (error) {
      if (!isCurrentReader(session, thisRender) || error?.name === "RenderingCancelledException") return false;
      status(readerStatus, "这一页暂时无法显示。请重新翻页或下载后使用 PDF 阅读器打开。", "error");
      throw error;
    } finally {
      if (isCurrentReader(session, thisRender)) {
        session.rendering = false;
        viewer.setAttribute("aria-busy", "false");
        setReaderControls(session);
      }
    }
  }

  async function showReading(bytes, thisOperation, signal) {
    await closeReading();
    if (signal.aborted || thisOperation !== operationId) {
      if (bytes.byteLength) bytes.fill(0);
      throw new DOMException("Operation cancelled", "AbortError");
    }
    const session = {
      bytes,
      loadingTask: null,
      document: null,
      renderTask: null,
      renderId: 0,
      pageNumber: 1,
      zoom: null,
      actualScale: 1,
      renderedWidth: 0,
      rendering: false,
      opening: true,
      closed: false,
    };
    readingSession = session;
    try {
      const library = await getPdfLibrary();
      if (!isCurrentReader(session) || signal.aborted || thisOperation !== operationId) {
        throw new DOMException("Operation cancelled", "AbortError");
      }
      session.loadingTask = library.getDocument({
        data: bytes,
        wasmUrl: "./vendor/pdfjs/wasm/",
        standardFontDataUrl: "./vendor/pdfjs/standard_fonts/",
        cMapUrl: "./vendor/pdfjs/cmaps/",
        cMapPacked: true,
        isEvalSupported: false,
      });
      // PDF.js takes ownership of bytes, usually transferring them to its worker.
      // They must not be zeroed until the loading task has been destroyed.
      session.document = await session.loadingTask.promise;
      if (!isCurrentReader(session) || signal.aborted || thisOperation !== operationId) {
        throw new DOMException("Operation cancelled", "AbortError");
      }
      viewer.hidden = false;
      const rendered = await renderPage(session);
      if (!rendered || !isCurrentReader(session) || signal.aborted || thisOperation !== operationId) {
        throw new DOMException("Operation cancelled", "AbortError");
      }
      session.opening = false;
      status(pageStatus, "笔记已解锁，可翻页和缩放。结束后请点击“关闭阅读”。");
      viewer.scrollIntoView({ block: "start", behavior: "auto" });
    } catch (error) {
      if (isCurrentReader(session)) await closeReading();
      throw error;
    }
  }

  function startDownload(blob) {
    const url = URL.createObjectURL(blob);
    downloadUrls.add(url);
    const link = document.createElement("a");
    link.href = url;
    link.download = "MFG入门笔记.pdf";
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    // Allow the browser time to consume the Blob before revoking its URL.
    setTimeout(() => {
      URL.revokeObjectURL(url);
      downloadUrls.delete(url);
    }, 60000);
    status(pageStatus, "已发起下载。打开下载的 PDF 时，请输入访问密码。");
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy || !selectedAction || !passwordInput.value) return;
    const action = selectedAction;
    const thisOperation = ++operationId;
    let password = passwordInput.value;
    passwordInput.value = "";
    requestController = new AbortController();
    const signal = requestController.signal;
    setBusy(true);
    status(dialogStatus, "正在验证密码并解锁文档，请稍候…");
    let plaintext = null;
    try {
      plaintext = await decrypt(action, password, signal);
      password = "";
      if (signal.aborted || thisOperation !== operationId) return;
      if (action === "read") {
        status(dialogStatus, "密码已通过，正在准备在线阅读器…");
        const readerBytes = new Uint8Array(plaintext);
        plaintext = null;
        await showReading(readerBytes, thisOperation, signal);
      } else {
        const blob = new Blob([plaintext], { type: "application/pdf" });
        new Uint8Array(plaintext).fill(0);
        plaintext = null;
        startDownload(blob);
      }
      if (signal.aborted || thisOperation !== operationId) return;
      selectedAction = null;
      dialog.close();
      if (action === "read") closeReader.focus({ preventScroll: true });
    } catch (error) {
      if (signal.aborted || thisOperation !== operationId) return;
      const message = error?.name === "OperationError"
        ? "密码不正确，或文档完整性校验失败。请重新输入密码。"
        : "文档加载失败。请检查网络后重试；如果持续失败，请刷新页面或联系笔记作者。";
      status(dialogStatus, message, "error");
    } finally {
      password = "";
      if (plaintext?.byteLength) new Uint8Array(plaintext).fill(0);
      if (thisOperation === operationId) {
        requestController = null;
        setBusy(false);
        if (dialog.open) passwordInput.focus();
      }
    }
  });

  function updatePage(target) {
    const session = readingSession;
    if (!session || session.opening || session.rendering) return;
    if (!Number.isInteger(target) || target < 1 || target > session.document.numPages) {
      status(readerStatus, `请输入 1 到 ${session.document.numPages} 之间的页码。`, "error");
      pageNumber.value = String(session.pageNumber);
      return;
    }
    session.pageNumber = target;
    renderPage(session).catch(() => undefined);
  }

  function updateZoom(direction) {
    const session = readingSession;
    if (!session || session.opening || session.rendering) return;
    session.zoom = Math.min(maximumZoom, Math.max(minimumZoom, session.actualScale * direction));
    renderPage(session).catch(() => undefined);
  }

  readButton.addEventListener("click", () => askPassword("read"));
  downloadButton.addEventListener("click", () => askPassword("download"));
  cancelButton.addEventListener("click", cancelOperation);
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    cancelOperation();
  });
  closeReader.addEventListener("click", () => {
    closeReading();
    status(pageStatus, "阅读已关闭。再次阅读或下载时，请重新输入密码。");
    readButton.focus();
  });
  previousPage.addEventListener("click", () => updatePage(readingSession?.pageNumber - 1));
  nextPage.addEventListener("click", () => updatePage(readingSession?.pageNumber + 1));
  pageForm.addEventListener("submit", (event) => {
    event.preventDefault();
    updatePage(Number(pageNumber.value));
  });
  zoomOut.addEventListener("click", () => updateZoom(1 / 1.2));
  zoomIn.addEventListener("click", () => updateZoom(1.2));
  fitWidth.addEventListener("click", () => {
    const session = readingSession;
    if (!session || session.opening || session.rendering) return;
    session.zoom = null;
    renderPage(session).catch(() => undefined);
  });
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const session = readingSession;
      if (session && !session.opening && session.zoom === null &&
          Math.abs(session.renderedWidth - canvasStage.clientWidth) > 1) {
        renderPage(session).catch(() => undefined);
      }
    }, 160);
  });
  window.addEventListener("pagehide", () => {
    clearTimeout(resizeTimer);
    cancelOperation();
    closeReading();
    for (const url of downloadUrls) URL.revokeObjectURL(url);
    downloadUrls.clear();
  });

  async function initialize() {
    clearCanvas();
    if (!window.isSecureContext || !globalThis.crypto?.subtle) {
      status(pageStatus, "此浏览器环境不支持安全解密。请使用最新版浏览器，通过 HTTPS 打开本页。", "error");
      return;
    }
    if (typeof dialog.showModal !== "function") {
      status(pageStatus, "此浏览器不支持密码对话框，请升级浏览器后再访问。", "error");
      return;
    }
    try {
      vault = validateVault(await (await fetchChecked("vault.json")).json());
      readButton.disabled = false;
      downloadButton.disabled = false;
      status(pageStatus, "选择阅读或下载，然后输入访问密码。");
      const action = new URLSearchParams(window.location.search).get("action");
      if (action === "read" || action === "download") askPassword(action);
    } catch {
      status(pageStatus, "访问入口暂时无法加载。请刷新页面重试；如果持续失败，请联系笔记作者。", "error");
    }
  }

  initialize();
})();
