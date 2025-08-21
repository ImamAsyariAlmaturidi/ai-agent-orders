// ====================== DOM ELEMENTS ======================
const chatWindow = document.getElementById("chat");
const chatForm = document.getElementById("chatForm");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const sessionInfo = document.getElementById("sessionInfo");

// Cart elements
const cartSidebar = document.getElementById("cartSidebar");
const cartBadge = document.getElementById("cartBadge");
const cartContent = document.getElementById("cartContent");
const cartEmpty = document.getElementById("cartEmpty");
const cartSummary = document.getElementById("cartSummary");
const totalItems = document.getElementById("totalItems");
const totalPrice = document.getElementById("totalPrice");
const checkoutBtn = document.getElementById("checkoutBtn");

// Debug elements
const debugPanel = document.getElementById("debugPanel");
const debugContent = document.getElementById("debugContent");

// ====================== STATE VARIABLES ======================
let isProcessing = false;
let currentCart = null;

// ====================== DEBUG FUNCTIONS ======================
function toggleDebug() {
  debugPanel.classList.toggle("show");
  if (debugPanel.classList.contains("show")) {
    document.querySelector(".debug-toggle").textContent = "❌ Close";
  } else {
    document.querySelector(".debug-toggle").textContent = "🐛 Debug";
  }
}

function addDebugLog(message, type = "info") {
  const timestamp = new Date().toLocaleTimeString();
  const entry = document.createElement("div");
  entry.className = `debug-entry debug-${type}`;
  entry.innerHTML = `
        <div class="debug-timestamp">${timestamp}</div>
        <div>${message}</div>
    `;
  debugContent.appendChild(entry);
  debugContent.scrollTop = debugContent.scrollHeight;

  // Keep only last 50 entries
  if (debugContent.children.length > 50) {
    debugContent.removeChild(debugContent.firstChild);
  }
}

// ====================== SESSION MANAGEMENT ======================
function generateObjectId() {
  const timestamp = Math.floor(Date.now() / 1000)
    .toString(16)
    .padStart(8, "0");
  const randomHex1 = Math.floor(Math.random() * 0xffffffffff)
    .toString(16)
    .padStart(10, "0");
  const randomHex2 = Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, "0");
  return timestamp + randomHex1 + randomHex2;
}

function getOrCreateSessionId() {
  let sessionId = localStorage.getItem("sessionId");
  if (!sessionId || sessionId.length !== 24) {
    sessionId = generateObjectId();
    localStorage.setItem("sessionId", sessionId);
    addDebugLog(`Created new session: ${sessionId}`, "info");
  } else {
    addDebugLog(`Using existing session: ${sessionId}`, "info");
  }
  sessionInfo.textContent = `Session: ${sessionId.substring(0, 8)}...`;
  return sessionId;
}

function resetSession() {
  if (confirm("Start a new conversation? Current chat history will be lost.")) {
    localStorage.removeItem("sessionId");
    chatWindow.innerHTML = "";
    const newSessionId = getOrCreateSessionId();
    appendMessage(
      "bot",
      "Hello! I'm starting a fresh conversation with you. How can I help?"
    );
    updateCartDisplay(null);
    addDebugLog("Session reset", "success");
  }
}

// ====================== UTILITY FUNCTIONS ======================
function formatCurrency(amount) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
}

function parseMarkdown(text) {
  text = text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/__(.*?)__/g, "<strong>$1</strong>");
  text = text.replace(/\*(.*?)\*/g, "<em>$1</em>");
  text = text.replace(/_(.*?)_/g, "<em>$1</em>");
  text = text.replace(/\n/g, "<br>");
  text = text.replace(/^\d+\.\s(.+)$/gm, "<li>$1</li>");
  text = text.replace(/(<li>.*<\/li>\s*)+/g, function (match) {
    return '<ol style="margin: 10px 0; padding-left: 20px;">' + match + "</ol>";
  });
  text = text.replace(/^[\-\*]\s(.+)$/gm, "<li>$1</li>");
  text = text.replace(/(<li>(?!.*<ol).*<\/li>\s*)+/g, function (match) {
    if (!match.includes("<ol")) {
      return (
        '<ul style="margin: 10px 0; padding-left: 20px;">' + match + "</ul>"
      );
    }
    return match;
  });
  text = text.replace(
    /`([^`]+)`/g,
    '<code style="background: #f4f4f4; padding: 2px 4px; border-radius: 3px;">$1</code>'
  );
  text = text.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" style="color: #6366f1;">$1</a>'
  );
  return text;
}

// ====================== CART FUNCTIONS ======================
function updateCartDisplay(cartSummary) {
  addDebugLog(
    `Updating cart display: ${
      cartSummary ? cartSummary.items.length + " items" : "empty"
    }`,
    "info"
  );

  if (!cartSummary || !cartSummary.items || cartSummary.items.length === 0) {
    cartBadge.textContent = "0";
    cartContent.innerHTML = `
            <div class="cart-empty">
                <div class="cart-empty-icon">🛒</div>
                <p>Your cart is empty</p>
                <small>Add items by chatting with the AI assistant</small>
            </div>
        `;
    const summaryElement = document.getElementById("cartSummary");
    if (summaryElement) {
      summaryElement.style.display = "none";
    }
    currentCart = null;
    return;
  }

  cartBadge.textContent = cartSummary.totalItems.toString();

  const cartItemsHtml = cartSummary.items
    .map(
      (item) => `
            <div class="cart-item">
                <div class="cart-item-name">${item.name}</div>
                <div class="cart-item-details">
                    <span class="cart-item-quantity">Qty: ${
                      item.quantity
                    }</span>
                    <span class="cart-item-price">${formatCurrency(
                      item.totalPrice
                    )}</span>
                </div>
            </div>
        `
    )
    .join("");

  cartContent.innerHTML = cartItemsHtml;
  totalItems.textContent = cartSummary.totalItems.toString();
  totalPrice.textContent = formatCurrency(cartSummary.totalPrice);

  const summaryElement = document.getElementById("cartSummary");
  if (summaryElement) {
    summaryElement.style.display = "block";
  }

  if (currentCart && currentCart.totalItems !== cartSummary.totalItems) {
    cartSidebar.classList.add("cart-updated");
    setTimeout(() => {
      cartSidebar.classList.remove("cart-updated");
    }, 500);
  }

  currentCart = cartSummary;
}

function handleCheckout() {
  if (!currentCart || currentCart.items.length === 0) {
    alert("Your cart is empty!");
    return;
  }

  const message = `I want to checkout my cart with ${
    currentCart.totalItems
  } items (Total: ${formatCurrency(currentCart.totalPrice)})`;
  appendMessage("user", message);
  sendMessageToBot(message);
}

// ====================== IMAGE HANDLING FUNCTIONS ======================
function isValidImageUrl(url) {
  return (
    url &&
    (url.startsWith("http://") ||
      url.startsWith("https://") ||
      url.startsWith("data:image/"))
  );
}

function createImageElement(imageUrl, index) {
  const imageContainer = document.createElement("div");
  imageContainer.className = "message-image-container";

  const imageElement = document.createElement("img");
  imageElement.className = "message-image";
  imageElement.alt = `Generated image ${index + 1}`;

  // Create loading placeholder
  const loadingElement = document.createElement("div");
  loadingElement.className = "image-loading";
  loadingElement.innerHTML = `
        <div class="image-spinner"></div>
        <span>Loading image...</span>
    `;

  imageContainer.appendChild(loadingElement);

  // Handle image loading
  imageElement.onload = function () {
    addDebugLog(`Image ${index + 1} loaded successfully`, "success");
    imageContainer.removeChild(loadingElement);
    imageContainer.appendChild(imageElement);

    // Add click to expand functionality
    imageElement.onclick = function () {
      expandImage(imageUrl);
    };
  };

  imageElement.onerror = function () {
    addDebugLog(`Failed to load image ${index + 1}: ${imageUrl}`, "error");
    const errorElement = document.createElement("div");
    errorElement.className = "image-error";
    errorElement.innerHTML = "Failed to load image";
    imageContainer.removeChild(loadingElement);
    imageContainer.appendChild(errorElement);
  };

  // Start loading the image
  addDebugLog(
    `Loading image ${index + 1}: ${imageUrl.substring(0, 50)}...`,
    "info"
  );
  imageElement.src = imageUrl;

  return imageContainer;
}

function expandImage(imageUrl) {
  const overlay = document.createElement("div");
  overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        cursor: pointer;
    `;

  const expandedImg = document.createElement("img");
  expandedImg.src = imageUrl;
  expandedImg.style.cssText = `
        max-width: 90%;
        max-height: 90%;
        object-fit: contain;
        border-radius: 8px;
    `;

  overlay.appendChild(expandedImg);
  document.body.appendChild(overlay);

  overlay.onclick = function () {
    document.body.removeChild(overlay);
  };
}

function displayImages(images, messageContent) {
  if (!images || images.length === 0) {
    return;
  }

  addDebugLog(`Displaying ${images.length} images`, "info");

  const imagesContainer = document.createElement("div");
  imagesContainer.className = "message-images";

  images.forEach((imageUrl, index) => {
    if (isValidImageUrl(imageUrl)) {
      const imageElement = createImageElement(imageUrl, index);
      imagesContainer.appendChild(imageElement);
    } else {
      addDebugLog(`Invalid image URL ${index + 1}: ${imageUrl}`, "error");
    }
  });

  if (imagesContainer.children.length > 0) {
    messageContent.appendChild(imagesContainer);
  }
}

// ====================== MESSAGE FUNCTIONS ======================
function appendMessage(role, text, images = null) {
  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${role}`;

  const avatar = document.createElement("div");
  avatar.className = `avatar ${role}`;
  avatar.textContent = role === "bot" ? "🤖" : "U";

  const messageContent = document.createElement("div");
  messageContent.className = "message-content";

  if (role === "bot") {
    messageContent.innerHTML = parseMarkdown(text);

    // Add images if they exist
    if (images && images.length > 0) {
      displayImages(images, messageContent);
    }
  } else {
    messageContent.textContent = text;
  }

  messageDiv.appendChild(avatar);
  messageDiv.appendChild(messageContent);
  chatWindow.appendChild(messageDiv);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function showTypingIndicator() {
  const typingDiv = document.createElement("div");
  typingDiv.className = "typing-indicator";
  typingDiv.id = "typing-indicator";

  const avatar = document.createElement("div");
  avatar.className = "avatar bot";
  avatar.textContent = "🤖";

  const typingContent = document.createElement("div");
  typingContent.className = "typing-content";

  const dotsContainer = document.createElement("div");
  dotsContainer.className = "typing-dots";

  for (let i = 0; i < 3; i++) {
    const dot = document.createElement("div");
    dot.className = "dot";
    dotsContainer.appendChild(dot);
  }

  typingContent.appendChild(dotsContainer);
  typingDiv.appendChild(avatar);
  typingDiv.appendChild(typingContent);
  chatWindow.appendChild(typingDiv);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function removeTypingIndicator() {
  const indicator = document.getElementById("typing-indicator");
  if (indicator) {
    indicator.remove();
  }
}

// ====================== API COMMUNICATION ======================
async function sendMessageToBot(message) {
  const sessionId = getOrCreateSessionId();
  addDebugLog(`🚀 Sending message: "${message.substring(0, 50)}..."`, "info");
  addDebugLog(`📋 Using sessionId: ${sessionId}`, "info");

  isProcessing = true;
  sendBtn.disabled = true;
  showTypingIndicator();

  const requestBody = {
    message,
    sessionId,
    userId: "6285183162659",
  };

  addDebugLog(
    `📤 Request body: ${JSON.stringify(requestBody, null, 2)}`,
    "info"
  );

  try {
    addDebugLog("🌐 Making fetch request to /api/chat", "info");
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    addDebugLog(
      `📡 Response status: ${res.status} ${res.statusText}`,
      res.ok ? "success" : "error"
    );

    if (!res.ok) {
      const errorText = await res.text();
      addDebugLog(`❌ Error response body: ${errorText}`, "error");
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const responseText = await res.text();
    addDebugLog(
      `📥 Raw response: ${responseText.substring(0, 200)}...`,
      "success"
    );

    let data;
    try {
      data = JSON.parse(responseText);
      addDebugLog(`✅ Parsed JSON successfully`, "success");
    } catch (parseError) {
      addDebugLog(`❌ JSON Parse Error: ${parseError.message}`, "error");
      addDebugLog(`🔍 Response text: ${responseText}`, "error");
      throw new Error(`Invalid JSON response: ${parseError.message}`);
    }

    removeTypingIndicator();

    const botResponse = data.response || "Sorry, I didn't understand that.";
    addDebugLog(
      `🤖 Bot response: "${botResponse.substring(0, 100)}..."`,
      "success"
    );

    // Handle images in response
    let images = null;
    if (data.images && Array.isArray(data.images) && data.images.length > 0) {
      images = data.images;
      addDebugLog(`🖼️ Received ${images.length} images in response`, "success");
    }

    appendMessage("bot", botResponse, images);

    if (data.cartSummary) {
      addDebugLog(
        `🛒 Cart summary received: ${data.cartSummary.items.length} items`,
        "success"
      );
      updateCartDisplay(data.cartSummary);
    } else {
      addDebugLog("🛒 No cart summary in response", "info");
    }
  } catch (err) {
    addDebugLog(`❌ ERROR: ${err.message}`, "error");
    addDebugLog(`📋 ERROR Details: ${err.stack || "No stack trace"}`, "error");
    console.error("Detailed error:", err);

    removeTypingIndicator();

    // Enhanced error messages
    let errorMessage = "Sorry, there was an error connecting to the server.";
    if (err.message.includes("Failed to fetch")) {
      errorMessage =
        "❌ Cannot connect to server. Is the backend running on port 3000?";
      addDebugLog(
        "🔧 Suggestion: Check if backend is running with 'npm start'",
        "error"
      );
    } else if (err.message.includes("500")) {
      errorMessage = "❌ Server error. Check the backend console for details.";
      addDebugLog(
        "🔧 Suggestion: Check backend logs for detailed error",
        "error"
      );
    } else if (err.message.includes("404")) {
      errorMessage = "❌ API endpoint not found. Check the server routes.";
      addDebugLog("🔧 Suggestion: Verify /api/chat endpoint exists", "error");
    } else if (err.message.includes("JSON")) {
      errorMessage = "❌ Invalid response from server. Check backend logs.";
      addDebugLog(
        "🔧 Suggestion: Backend might be returning HTML instead of JSON",
        "error"
      );
    }

    appendMessage("bot", errorMessage);
  } finally {
    isProcessing = false;
    sendBtn.disabled = false;
    messageInput.focus();
  }
}

// ====================== EVENT HANDLERS ======================
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (isProcessing) return;

  const message = messageInput.value.trim();
  if (!message) return;

  appendMessage("user", message);
  messageInput.value = "";
  await sendMessageToBot(message);
});

// Auto-resize textarea
messageInput.addEventListener("input", function () {
  this.style.height = "auto";
  this.style.height = Math.min(this.scrollHeight, 120) + "px";
});

// ====================== INITIALIZATION ======================
window.addEventListener("DOMContentLoaded", async () => {
  addDebugLog("🌟 Page loaded, initializing...", "info");
  const sessionId = getOrCreateSessionId();

  appendMessage(
    "bot",
    "Hello! How can I assist you today? Try asking me to generate an image!"
  );
  messageInput.focus();

  // Load initial cart state
  try {
    addDebugLog("🛒 Loading initial cart state...", "info");
    const res = await fetch(`/api/cart/6285183162659`);
    addDebugLog(
      `🛒 Cart API response: ${res.status}`,
      res.ok ? "success" : "error"
    );

    if (res.ok) {
      const data = await res.json();
      addDebugLog(`🛒 Initial cart data received`, "success");
      updateCartDisplay(data.cartSummary);
    } else {
      addDebugLog(`🛒 Failed to load cart: ${res.statusText}`, "error");
    }
  } catch (err) {
    addDebugLog(`🛒 Error loading initial cart: ${err.message}`, "error");
  }

  addDebugLog("✅ Initialization complete", "success");
});

// ====================== ERROR HANDLING ======================
window.addEventListener("error", (e) => {
  addDebugLog(
    `💥 Global Error: ${e.message} at ${e.filename}:${e.lineno}`,
    "error"
  );
});

window.addEventListener("unhandledrejection", (e) => {
  addDebugLog(`💥 Unhandled Promise Rejection: ${e.reason}`, "error");
});

// ====================== KEYBOARD SHORTCUTS ======================
messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if (!isProcessing) {
      chatForm.dispatchEvent(new Event("submit"));
    }
  }
});

// ====================== ACCESSIBILITY ENHANCEMENTS ======================
document.addEventListener("keydown", (e) => {
  // Alt + R to reset session
  if (e.altKey && e.key === "r") {
    e.preventDefault();
    resetSession();
  }

  // Alt + D to toggle debug
  if (e.altKey && e.key === "d") {
    e.preventDefault();
    toggleDebug();
  }
});
