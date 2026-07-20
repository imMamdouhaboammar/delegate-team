import http from 'node:http';
import https from 'node:https';
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { timingSafeEqual } from 'node:crypto';
import { WORKSPACE_ROOT } from '../config/index.js';

const DEFAULT_MAX_BODY_BYTES = 2 * 1024 * 1024;

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.warn(`[PROXY] Ignoring invalid ${name}=${raw}. Using ${fallback}.`);
    return fallback;
  }

  return parsed;
}

const MAX_BODY_BYTES = readPositiveIntEnv("DT_PROXY_MAX_BODY", DEFAULT_MAX_BODY_BYTES);

const FALLBACK_RING: Record<string, string[]> = {
  gemini: ["openrouter", "openai"],
  openrouter: ["gemini", "openai"],
  openai: ["gemini", "openrouter"]
};

function redact(s: any) {
  if (!s) return "";
  return String(s)
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]")
    .replace(/(api[_-]?key["']?\s*[:=]\s*["']?)[^"',\s]+/gi, "$1[REDACTED]");
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function extractAuthToken(req: http.IncomingMessage): string | undefined {
  const bearer = firstHeader(req.headers.authorization)?.replace(/^Bearer\s+/i, "");
  return bearer || firstHeader(req.headers["x-api-key"]);
}

function safeTokenEqual(actual: string | undefined, expected: string | undefined): boolean {
  if (!actual || !expected) return false;

  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  if (actualBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

function readEnvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) return {};
  const content = readFileSync(filePath, "utf8");
  const env: Record<string, string> = {};
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

let cachedConfig: any = null;
function getLocalConfig() {
  if (cachedConfig) return cachedConfig;
  const configPath = join(homedir(), ".config", "dt", "config.json");
  if (existsSync(configPath)) {
    try {
      cachedConfig = JSON.parse(readFileSync(configPath, "utf8"));
      return cachedConfig;
    } catch (err) {
      // Ignore
    }
  }
  cachedConfig = {};
  return cachedConfig;
}

let cachedGoogleProject: string | null = null;
function getGoogleProject(): string {
  if (cachedGoogleProject) return cachedGoogleProject as string;
  try {
    const proj = execSync("gcloud config get-value project", { encoding: "utf8" }).trim();
    if (proj && proj !== "(unset)") {
      cachedGoogleProject = proj;
      return proj;
    }
  } catch (err) {
    // Ignore
  }
  const config = getLocalConfig();
  if (config.project_id) {
    cachedGoogleProject = config.project_id;
    return cachedGoogleProject as string;
  }
  cachedGoogleProject = process.env.GOOGLE_CLOUD_PROJECT || "";
  return cachedGoogleProject as string;
}

const keys: Record<string, string | undefined> = {
  gemini: process.env.GEMINI_API_KEY || workspaceEnv.GEMINI_API_KEY || geminiEnv.GEMINI_API_KEY,
  openrouter: process.env.OPENROUTER_API_KEY || workspaceEnv.OPENROUTER_API_KEY || openrouterEnv.OPENROUTER_API_KEY,
  openai: process.env.OPENAI_API_KEY || workspaceEnv.OPENAI_API_KEY
};

let cachedGcloudToken: string | null = null;
let cachedTokenExpiry = 0;

function getGcloudToken(): string | null {
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

function makeRequestStream(urlStr: string, options: any, bodyData?: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.request(urlStr, options, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
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

function anthropicToOpenAI(payload: any) {
  const newPayload = { ...payload };
  if (newPayload.system) {
    newPayload.messages = [{ role: "system", content: newPayload.system }, ...(newPayload.messages || [])];
    delete newPayload.system;
  }
  
  if (newPayload.tools) {
    newPayload.tools = newPayload.tools.map((t: any) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema
      }
    }));
  }

  if (Array.isArray(newPayload.messages)) {
    newPayload.messages = newPayload.messages.map((msg: any) => {
      let content = msg.content;
      if (Array.isArray(content)) {
        let textContent = "";
        let tool_calls: any[] = [];
        
        for (const block of content) {
          if (block.type === "text") textContent += block.text;
          else if (block.type === "tool_use") {
            tool_calls.push({
              id: block.id,
              type: "function",
              function: {
                name: block.name,
                arguments: typeof block.input === "string" ? block.input : JSON.stringify(block.input)
              }
            });
          }
          else if (block.type === "tool_result") {
            return {
              role: "tool",
              tool_call_id: block.tool_use_id,
              content: typeof block.content === "string" ? block.content : JSON.stringify(block.content)
            };
          }
        }
        
        if (msg.role === "assistant" && tool_calls.length > 0) {
          return { role: msg.role, content: textContent || null, tool_calls };
        }
        
        content = textContent;
      }
      return { role: msg.role, content };
    });
  }
  return newPayload;
}

function openAIToAnthropic(responseStr: string) {
  try {
    const data = JSON.parse(responseStr);
    if (!data.choices) return responseStr;
    
    let content: any[] = [];
    const msg = data.choices[0]?.message;
    if (msg?.content) {
      content.push({ type: "text", text: msg.content });
    }
    
    if (msg?.tool_calls) {
      for (const tc of msg.tool_calls) {
        if (tc.type === "function") {
          content.push({
            type: "tool_use",
            id: tc.id,
            name: tc.function.name,
            input: JSON.parse(tc.function.arguments || "{}")
          });
        }
      }
    }

    let stop_reason = "end_turn";
    const fr = data.choices[0]?.finish_reason;
    if (fr === "tool_calls") stop_reason = "tool_use";
    else if (fr === "length") stop_reason = "max_tokens";
    else if (fr === "stop") stop_reason = "end_turn";
    else if (fr) stop_reason = fr;

    return JSON.stringify({
      id: data.id || `msg_${Date.now()}`,
      type: "message",
      role: "assistant",
      content,
      model: data.model || "unknown",
      stop_reason,
      usage: {
        input_tokens: data.usage?.prompt_tokens || 0,
        output_tokens: data.usage?.completion_tokens || 0
      }
    });
  } catch (e) {
    return responseStr;
  }
}

function mapModel(backend: string, originalModel: string, useVertex = false): string {
  const config = getLocalConfig();
  const mapping = config.model_mapping || {};

  if (!originalModel) {
    return mapping.default || (backend === "gemini" ? (useVertex ? "google/gemini-3.5-flash" : "gemini-3.5-flash") : "gpt-4o");
  }

  const modelLower = originalModel.toLowerCase();
  
  // Custom user mappings take precedence
  if (mapping[modelLower]) {
    return mapping[modelLower];
  }

  if (backend === "gemini") {
    if (useVertex) {
      if (modelLower.includes("pro") || modelLower.includes("sonnet") || modelLower.includes("opus")) {
        return "google/gemini-3.1-pro-custom-tools";
      }
      return "google/gemini-3.5-flash";
    } else {
      if (modelLower.includes("pro") || modelLower.includes("sonnet") || modelLower.includes("opus")) {
        return "gemini-3.1-pro-custom-tools";
      }
      return "gemini-3.5-flash";
    }
  }

  if (backend === "openrouter") {
    if (modelLower.includes("sonnet") || modelLower.includes("claude-3-5") || modelLower.includes("claude-3.5")) {
      return "anthropic/claude-3.5-sonnet";
    }
    if (modelLower.includes("opus")) {
      return "anthropic/claude-3-opus";
    }
    if (modelLower.includes("haiku")) {
      return "anthropic/claude-3-5-haiku";
    }
    if (modelLower.includes("gemini") && modelLower.includes("pro")) {
      return "google/gemini-3.1-pro-custom-tools";
    }
    if (modelLower.includes("gemini") && (modelLower.includes("flash") || modelLower.includes("lite"))) {
      return "google/gemini-3.5-flash";
    }
    if (modelLower.includes("gpt-4") || modelLower.includes("gpt-4o")) {
      return "openai/gpt-4o";
    }
    
    if (originalModel.includes("/")) return originalModel;
    console.warn(`[PROXY] Warning: OpenRouter model "${originalModel}" missing provider slash. Keeping as-is, but it may fail.`);
    return originalModel;
  }

  if (backend === "openai") {
    if (modelLower.includes("gpt-4") || modelLower.includes("gpt-4o")) {
      return "gpt-4o";
    }
    return originalModel;
  }

  return originalModel;
}

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  // CORS Headers
  const origin = req.headers.origin || "";
  const allowedOrigins = new Set([
    "http://localhost:3210",
    "http://127.0.0.1:3210",
    "http://localhost:3000",
    "http://127.0.0.1:3000"
  ]);

  if (origin && allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else if (!origin) {
    // allow server-to-server or CLI requests where origin is generally not set
  } else {
    // If an unknown origin calls, we don't set the header
  }
  
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    return res.end();
  }

  const config = getLocalConfig();
  const requiredToken = config.proxy_token || process.env.PROXY_TOKEN;

  if (!requiredToken) {
    res.writeHead(500);
    return res.end("Proxy requires a configured proxy_token in ~/.config/dt/config.json or PROXY_TOKEN env var");
  }

  const authHeader = extractAuthToken(req);

  if (!safeTokenEqual(authHeader, String(requiredToken))) {
    res.writeHead(401);
    return res.end("Unauthorized");
  }

  if (req.method !== "POST") {
    res.writeHead(405);
    return res.end("Method Not Allowed");
  }

  let body = "";
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      res.writeHead(413);
      return res.end("Payload Too Large");
    }
    body += chunk;
  }

  let payload;
  try {
    payload = JSON.parse(body);
  } catch (e) {
    res.writeHead(400);
    return res.end("Bad Request");
  }

  const isAnthropic = req.url?.includes("anthropic") || req.headers["x-api-key"] || payload.system !== undefined;
  const isStream = !!payload.stream;
  
  let openAIPayload = { ...payload };
  if (isAnthropic) {
    openAIPayload = anthropicToOpenAI(payload);
  }

  if (!openAIPayload.max_tokens && !openAIPayload.max_completion_tokens) {
    openAIPayload.max_tokens = 1024;
  }

  const clientKey = authHeader;

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
      let urlStr: string, headers: any;
      const resolvedModel = mapModel(backend, openAIPayload.model, useVertex);
      const backendPayload = { ...openAIPayload, model: resolvedModel };

      if (backend === "gemini") {
        if (useVertex) {
          urlStr = `https://aiplatform.googleapis.com/v1/projects/${getGoogleProject()}/locations/global/endpoints/openapi/chat/completions`;
          headers = {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${activeKey}`
          };
        } else {
          urlStr = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
          headers = {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${activeKey}`
          };
        }
      } else if (backend === "openrouter") {
        urlStr = "https://openrouter.ai/api/v1/chat/completions";
        headers = {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${activeKey}`
        };
      } else if (backend === "openai") {
        urlStr = "https://api.openai.com/v1/chat/completions";
        headers = {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${activeKey}`
        };
      } else {
        continue;
      }

      console.log(`[PROXY] Attempting backend [${backend.toUpperCase()}] with model [${resolvedModel}] (Streaming: ${isStream}, Vertex: ${useVertex})`);

      const response = await makeRequestStream(urlStr, { method: "POST", headers }, JSON.stringify(backendPayload));
      
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
                    const delta = parsed.choices?.[0]?.delta || {};
                    if (delta.content) {
                      res.write(`event: content_block_delta\ndata: ${JSON.stringify({
                        type: "content_block_delta",
                        index: 0,
                        delta: { type: "text_delta", text: delta.content }
                      })}\n\n`);
                    }
                    if (delta.tool_calls && delta.tool_calls.length > 0) {
                      for (const tc of delta.tool_calls) {
                        const tcIndex = (tc.index || 0) + 1; // offset by 1 because 0 is text block
                        if (tc.function?.name) {
                          res.write(`event: content_block_start\ndata: ${JSON.stringify({
                            type: "content_block_start",
                            index: tcIndex,
                            content_block: { type: "tool_use", id: tc.id || "call_" + Date.now(), name: tc.function.name, input: {} }
                          })}\n\n`);
                        }
                        if (tc.function?.arguments) {
                          res.write(`event: content_block_delta\ndata: ${JSON.stringify({
                            type: "content_block_delta",
                            index: tcIndex,
                            delta: { type: "input_json_delta", partial_json: tc.function.arguments }
                          })}\n\n`);
                        }
                      }
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
    } catch (err: any) {
      const errStr = typeof err === 'object' ? JSON.stringify(err) : String(err);
      console.error(`[PROXY] Backend [${backend.toUpperCase()}] failed or returned error:`, redact(err.status || err.message || errStr), redact(err.data || ""));
    }
  }

  res.writeHead(502, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "All backends failed in Fallback Ring" }));
}

export function runServe(port: number) {
  const server = http.createServer(handleRequest);
  server.listen(port, '127.0.0.1', () => {
    const address = server.address();
    const activePort = typeof address === 'object' && address ? address.port : port;
    console.log(`\n🚀 Starting LLM Gateway Proxy Server on http://127.0.0.1:${activePort}...`);
    console.log(`[PROXY] Max body bytes: ${MAX_BODY_BYTES}`);
  });
  return server;
}
