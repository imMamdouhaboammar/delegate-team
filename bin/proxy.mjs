#!/usr/bin/env node
import http from "node:http";
import https from "node:https";
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const WORKSPACE_ROOT = resolve(__dirname, "..");

const port = process.argv[2] || 3000;

const FALLBACK_RING = {
  gemini: ["openrouter", "openai"],
  openrouter: ["gemini", "openai"],
  openai: ["gemini", "openrouter"]
};

function readEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const content = readFileSync(filePath, "utf8");
  const env = {};
  content.split("\n").forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      let key = match[1];
      let value = match[2] || "";
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      else if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
      env[key] = value;
    }
  });
  return env;
}

const geminiEnv = readEnvFile(join(homedir(), ".gemini", ".env"));
const openrouterEnv = readEnvFile(join(homedir(), ".openrouter", ".env"));
const workspaceEnv = readEnvFile(join(WORKSPACE_ROOT, ".env"));

let cachedGoogleProject = null;
function getGoogleProject() {
  if (cachedGoogleProject) return cachedGoogleProject;
  try {
    const proj = execSync("gcloud config get-value project", { encoding: "utf8" }).trim();
    if (proj && proj !== "(unset)") {
      cachedGoogleProject = proj;
      return proj;
    }
  } catch (err) {
    // Ignore
  }
  const configPath = join(homedir(), ".config", "dt", "config.json");
  if (existsSync(configPath)) {
    try {
      const config = JSON.parse(readFileSync(configPath, "utf8"));
      if (config.project_id) {
        cachedGoogleProject = config.project_id;
        return cachedGoogleProject;
      }
    } catch (err) {
      // Ignore
    }
  }
  cachedGoogleProject = process.env.GOOGLE_CLOUD_PROJECT || "";
  return cachedGoogleProject;
}

const keys = {
  gemini: process.env.GEMINI_API_KEY || workspaceEnv.GEMINI_API_KEY || geminiEnv.GEMINI_API_KEY,
  openrouter: process.env.OPENROUTER_API_KEY || workspaceEnv.OPENROUTER_API_KEY || openrouterEnv.OPENROUTER_API_KEY,
  openai: process.env.OPENAI_API_KEY || workspaceEnv.OPENAI_API_KEY
};

let cachedGcloudToken = null;
let cachedTokenExpiry = 0;

function getGcloudToken() {
  const now = Date.now();
  if (cachedGcloudToken && now < cachedTokenExpiry) {
    return cachedGcloudToken;
  }
  try {
    const token = execSync("gcloud auth print-access-token", { encoding: "utf8" }).trim();
    cachedGcloudToken = token;
    cachedTokenExpiry = now + 5 * 60 * 1000; // Cache for 5 minutes
    return token;
  } catch (err) {
    return null;
  }
}

function makeRequestStream(urlStr, options, bodyData) {
  return new Promise((resolve, reject) => {
    const req = https.request(urlStr, options, (res) => {
      if (res.statusCode >= 400) {
        let errData = "";
        res.on("data", chunk => errData += chunk);
        res.on("end", () => {
          reject({ status: res.statusCode, data: errData });
        });
        return;
      }
      resolve({ status: res.statusCode, headers: res.headers, stream: res });
    });
    req.on("error", reject);
    if (bodyData) req.write(bodyData);
    req.end();
  });
}

function anthropicToOpenAI(payload) {
  const newPayload = { ...payload };
  if (newPayload.system) {
    newPayload.messages = [{ role: "system", content: newPayload.system }, ...(newPayload.messages || [])];
    delete newPayload.system;
  }
  
  if (Array.isArray(newPayload.messages)) {
    newPayload.messages = newPayload.messages.map(msg => {
      let content = msg.content;
      if (Array.isArray(content)) {
        content = content.map(block => block.text || "").join("\n");
      }
      return { role: msg.role, content };
    });
  }
  return newPayload;
}

function openAIToAnthropic(responseStr) {
  try {
    const data = JSON.parse(responseStr);
    if (!data.choices) return responseStr;
    return JSON.stringify({
      id: data.id || `msg_${Date.now()}`,
      type: "message",
      role: "assistant",
      content: [
        {
          type: "text",
          text: data.choices[0]?.message?.content || ""
        }
      ],
      model: data.model || "unknown",
      stop_reason: data.choices[0]?.finish_reason === "stop" ? "end_turn" : data.choices[0]?.finish_reason,
      usage: {
        input_tokens: data.usage?.prompt_tokens || 0,
        output_tokens: data.usage?.completion_tokens || 0
      }
    });
  } catch (e) {
    return responseStr;
  }
}

function mapModel(backend, originalModel, useVertex = false) {
  if (!originalModel) {
    if (backend === "gemini") {
      return useVertex ? "google/gemini-3.5-flash" : "gemini-1.5-flash";
    }
    return backend === "openrouter" ? "google/gemini-3.5-flash" : "gpt-4o";
  }

  const modelLower = originalModel.toLowerCase();

  if (backend === "gemini") {
    if (useVertex) {
      if (modelLower.includes("pro") || modelLower.includes("sonnet") || modelLower.includes("opus")) {
        return "google/gemini-3.1-pro-preview";
      }
      return "google/gemini-3.5-flash";
    } else {
      if (modelLower.includes("pro") || modelLower.includes("sonnet") || modelLower.includes("opus")) {
        return "gemini-1.5-pro";
      }
      return "gemini-1.5-flash";
    }
  }

  if (backend === "openrouter") {
    if (modelLower.includes("sonnet") || modelLower.includes("claude-3-5") || modelLower.includes("claude-3.5")) {
      return "anthropic/claude-sonnet-4.6";
    }
    if (modelLower.includes("opus")) {
      return "anthropic/claude-opus-4.7";
    }
    if (modelLower.includes("haiku")) {
      return "~anthropic/claude-haiku-latest";
    }
    if (modelLower.includes("gemini") && modelLower.includes("pro")) {
      return "google/gemini-3.1-pro-preview";
    }
    if (modelLower.includes("gemini") && (modelLower.includes("flash") || modelLower.includes("lite"))) {
      return "google/gemini-3.5-flash";
    }
    if (modelLower.includes("gpt-4") || modelLower.includes("gpt-5") || modelLower.includes("gpt-4o")) {
      return "openai/gpt-5.5-pro";
    }
    
    if (originalModel.includes("/")) return originalModel;
    return "google/gemini-3.5-flash";
  }

  if (backend === "openai") {
    if (modelLower.includes("gpt-4") || modelLower.includes("gpt-5") || modelLower.includes("gpt-4o")) {
      return "gpt-4o";
    }
    return originalModel;
  }

  return originalModel;
}

async function handleRequest(req, res) {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    return res.end();
  }

  if (req.method !== "POST") {
    res.writeHead(405);
    return res.end("Method Not Allowed");
  }

  let body = "";
  for await (const chunk of req) {
    body += chunk;
  }

  let payload;
  try {
    payload = JSON.parse(body);
  } catch (e) {
    res.writeHead(400);
    return res.end("Bad Request");
  }

  const isAnthropic = req.url.includes("anthropic") || req.headers["x-api-key"] || payload.system !== undefined;
  const isStream = !!payload.stream;
  
  let openAIPayload = { ...payload };
  if (isAnthropic) {
    openAIPayload = anthropicToOpenAI(payload);
  }

  // Prevent OpenRouter credit reservation failure (402) by setting a default max_tokens if omitted
  if (!openAIPayload.max_tokens && !openAIPayload.max_completion_tokens) {
    openAIPayload.max_tokens = 1024;
  }

  const clientKey = req.headers["authorization"]?.replace(/^Bearer\s+/i, "") || req.headers["x-api-key"];

  // Prioritize based on local key presence
  let primaryBackend = "gemini";
  const hasGcloud = !!getGcloudToken();
  const hasGeminiKey = !!keys.gemini;
  
  if (!hasGeminiKey && !hasGcloud && keys.openrouter) primaryBackend = "openrouter";
  else if (!hasGeminiKey && !hasGcloud && !keys.openrouter && keys.openai) primaryBackend = "openai";

  const chain = [primaryBackend, ...(FALLBACK_RING[primaryBackend] || [])];

  for (const backend of chain) {
    let activeKey = null;
    let useVertex = false;

    if (backend === "gemini") {
      if (keys.gemini) {
        activeKey = keys.gemini;
        useVertex = false;
      } else {
        const token = getGcloudToken();
        if (token) {
          activeKey = token;
          useVertex = true;
        }
      }
    } else {
      activeKey = keys[backend] || clientKey;
    }

    if (!activeKey) continue;

    try {
      let url, headers;
      const resolvedModel = mapModel(backend, openAIPayload.model, useVertex);
      const backendPayload = { ...openAIPayload, model: resolvedModel };

      if (backend === "gemini") {
        if (useVertex) {
          url = `https://aiplatform.googleapis.com/v1/projects/${getGoogleProject()}/locations/global/endpoints/openapi/chat/completions`;
          headers = {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${activeKey}`
          };
        } else {
          url = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
          headers = {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${activeKey}`
          };
        }
      } else if (backend === "openrouter") {
        url = "https://openrouter.ai/api/v1/chat/completions";
        headers = {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${activeKey}`
        };
      } else if (backend === "openai") {
        url = "https://api.openai.com/v1/chat/completions";
        headers = {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${activeKey}`
        };
      }

      console.log(`[PROXY] Attempting backend [${backend.toUpperCase()}] with model [${resolvedModel}] (Streaming: ${isStream}, Vertex: ${useVertex})`);

      const response = await makeRequestStream(url, { method: "POST", headers }, JSON.stringify(backendPayload));
      
      if (isStream) {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive"
        });

        if (isAnthropic) {
          res.write(`event: message_start\ndata: ${JSON.stringify({
            type: "message_start",
            message: {
              id: `msg_${Date.now()}`,
              type: "message",
              role: "assistant",
              content: [],
              model: resolvedModel,
              stop_reason: null,
              stop_sequence: null,
              usage: { input_tokens: 0, output_tokens: 0 }
            }
          })}\n\n`);

          res.write(`event: content_block_start\ndata: ${JSON.stringify({
            type: "content_block_start",
            index: 0,
            content_block: { type: "text", text: "" }
          })}\n\n`);
        }

        let sseBuffer = "";
        for await (const chunk of response.stream) {
          sseBuffer += chunk.toString("utf8");
          let lineEnd = sseBuffer.indexOf("\n");
          while (lineEnd !== -1) {
            const line = sseBuffer.slice(0, lineEnd).trim();
            sseBuffer = sseBuffer.slice(lineEnd + 1);
            
            if (line.startsWith("data: ")) {
              const dataContent = line.slice(6).trim();
              if (dataContent === "[DONE]") {
                if (isAnthropic) {
                  res.write(`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`);
                  res.write(`event: message_delta\ndata: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 0 } })}\n\n`);
                  res.write(`event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`);
                } else {
                  res.write("data: [DONE]\n\n");
                }
              } else {
                try {
                  const parsed = JSON.parse(dataContent);
                  if (isAnthropic) {
                    const text = parsed.choices?.[0]?.delta?.content || "";
                    if (text) {
                      res.write(`event: content_block_delta\ndata: ${JSON.stringify({
                        type: "content_block_delta",
                        index: 0,
                        delta: { type: "text_delta", text }
                      })}\n\n`);
                    }
                  } else {
                    res.write(`data: ${JSON.stringify(parsed)}\n\n`);
                  }
                } catch (e) {
                  if (!isAnthropic) res.write(`data: ${dataContent}\n\n`);
                }
              }
            }
            lineEnd = sseBuffer.indexOf("\n");
          }
        }
        res.end();
        return;
      } else {
        let fullData = "";
        for await (const chunk of response.stream) {
          fullData += chunk.toString("utf8");
        }
        
        let responseData = fullData;
        if (isAnthropic) {
          responseData = openAIToAnthropic(responseData);
        }
        res.writeHead(response.status, { "Content-Type": "application/json" });
        return res.end(responseData);
      }
    } catch (err) {
      console.error(`[PROXY] Backend [${backend.toUpperCase()}] failed or returned error:`, err.status || err.message || err, err.data || "");
    }
  }

  res.writeHead(502, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "All backends failed in Fallback Ring" }));
}

const server = http.createServer(handleRequest);
server.listen(port, () => {
  console.log(`LLM Gateway Proxy Server listening on port ${port}`);
});
