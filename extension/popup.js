const API_URL = "http://127.0.0.1:19827";

const statusBar = document.getElementById("statusBar");
const titleInput = document.getElementById("titleInput");
const urlPreview = document.getElementById("urlPreview");
const contentPreview = document.getElementById("contentPreview");
const clipBtn = document.getElementById("clipBtn");

let extractedContent = "";
let pageUrl = "";

// Check if LLM Wiki app is running
async function checkConnection() {
  try {
    const res = await fetch(`${API_URL}/status`, { method: "GET" });
    const data = await res.json();
    if (data.ok) {
      statusBar.className = "status connected";
      statusBar.textContent = "✓ Connected to LLM Wiki";
      return true;
    }
  } catch {
    // not running
  }
  statusBar.className = "status disconnected";
  statusBar.textContent = "✗ LLM Wiki app is not running";
  clipBtn.disabled = true;
  return false;
}

// Extract content from current tab
async function extractContent() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    pageUrl = tab.url || "";
    titleInput.value = tab.title || "Untitled";
    urlPreview.textContent = pageUrl;

    // Inject content extraction script
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        // Try to get article content using common selectors
        const selectors = [
          "article",
          '[role="main"]',
          "main",
          ".post-content",
          ".article-content",
          ".entry-content",
          "#content",
          ".content",
        ];

        let article = null;
        for (const sel of selectors) {
          article = document.querySelector(sel);
          if (article) break;
        }

        // Fallback to body
        if (!article) {
          article = document.body;
        }

        // Clone to avoid modifying the page
        const clone = article.cloneNode(true);

        // Remove unwanted elements
        const removeSelectors = [
          "script", "style", "nav", "header", "footer",
          ".sidebar", ".nav", ".menu", ".ad", ".advertisement",
          ".comments", ".comment", "#comments", ".social-share",
          ".related-posts", ".newsletter", "[role='navigation']",
        ];
        for (const sel of removeSelectors) {
          clone.querySelectorAll(sel).forEach((el) => el.remove());
        }

        // Convert to simplified markdown-like text
        function nodeToText(node, depth = 0) {
          if (node.nodeType === Node.TEXT_NODE) {
            return node.textContent.trim();
          }
          if (node.nodeType !== Node.ELEMENT_NODE) return "";

          const tag = node.tagName.toLowerCase();
          const children = Array.from(node.childNodes)
            .map((c) => nodeToText(c, depth))
            .filter((t) => t)
            .join(" ");

          if (!children.trim()) return "";

          switch (tag) {
            case "h1": return `\n\n# ${children}\n\n`;
            case "h2": return `\n\n## ${children}\n\n`;
            case "h3": return `\n\n### ${children}\n\n`;
            case "h4": return `\n\n#### ${children}\n\n`;
            case "p": return `\n\n${children}\n\n`;
            case "li": return `\n- ${children}`;
            case "ul": case "ol": return `\n${children}\n`;
            case "blockquote": return `\n\n> ${children}\n\n`;
            case "pre": case "code": return `\n\n\`\`\`\n${children}\n\`\`\`\n\n`;
            case "strong": case "b": return `**${children}**`;
            case "em": case "i": return `*${children}*`;
            case "a": {
              const href = node.getAttribute("href") || "";
              return `[${children}](${href})`;
            }
            case "img": {
              const alt = node.getAttribute("alt") || "image";
              const src = node.getAttribute("src") || "";
              return `\n\n![${alt}](${src})\n\n`;
            }
            case "br": return "\n";
            case "hr": return "\n\n---\n\n";
            case "table": return `\n\n${children}\n\n`;
            case "tr": return `| ${children} |\n`;
            case "th": case "td": return ` ${children} |`;
            default: return children;
          }
        }

        let text = nodeToText(clone);
        // Clean up excessive whitespace
        text = text.replace(/\n{3,}/g, "\n\n").trim();
        return text;
      },
    });

    if (results && results[0] && results[0].result) {
      extractedContent = results[0].result;
      const preview = extractedContent.slice(0, 200);
      contentPreview.textContent = preview + (extractedContent.length > 200 ? "..." : "");
      clipBtn.disabled = false;
    } else {
      contentPreview.textContent = "Failed to extract content";
    }
  } catch (err) {
    contentPreview.textContent = `Error: ${err.message}`;
  }
}

// Send clip to LLM Wiki
async function sendClip() {
  clipBtn.disabled = true;
  statusBar.className = "status sending";
  statusBar.textContent = "⏳ Sending to LLM Wiki...";

  try {
    const res = await fetch(`${API_URL}/clip`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: titleInput.value,
        url: pageUrl,
        content: extractedContent,
      }),
    });

    const data = await res.json();

    if (data.ok) {
      statusBar.className = "status success";
      statusBar.textContent = `✓ Saved: ${data.path}`;
      clipBtn.textContent = "✓ Clipped!";
      clipBtn.disabled = true;
    } else {
      statusBar.className = "status error";
      statusBar.textContent = `✗ Error: ${data.error}`;
      clipBtn.disabled = false;
    }
  } catch (err) {
    statusBar.className = "status error";
    statusBar.textContent = `✗ Connection failed: ${err.message}`;
    clipBtn.disabled = false;
  }
}

clipBtn.addEventListener("click", sendClip);

// Initialize
(async () => {
  const connected = await checkConnection();
  if (connected) {
    await extractContent();
  }
})();
