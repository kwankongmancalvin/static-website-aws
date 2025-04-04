import axios from "axios";
import pRetry from "p-retry";
import { setTimeout } from "timers/promises";
import { HttpsProxyAgent } from "https-proxy-agent";

// Cache with TTL (Time To Live)
const ipCache = {
  value: null as string | null, // Stores the cached IP address
  timestamp: 0, // Stores the time of the last update
  ttl: 15 * 60 * 1000, // Cache expiration time in milliseconds (15 minutes)
};

interface IpFetchOptions {
  useCurrentIp?: boolean; // Whether to fetch the current IP or return a fallback
  timeout?: number; // Timeout for each request in milliseconds
  retries?: number; // Number of retry attempts
  endpoints?: string[]; // List of API endpoints to fetch the IP
  proxy?: string; // Optional proxy URL
}

export async function getIpAddress(options?: IpFetchOptions): Promise<string> {
  const {
    useCurrentIp = true,
    timeout = 3000,
    retries = 3,
    endpoints = [
      "https://api.ipify.org?format=json", // Returns { "ip": "YOUR_IP" }
      "https://ipinfo.io/json", // Returns { "ip": "YOUR_IP" }
      "https://ifconfig.me/all.json", // Returns { "ip_addr": "YOUR_IP" }
    ],
    proxy,
  } = options || {};

  if (!useCurrentIp) {
    return "0.0.0.0/0"; // Return fallback IP range when `useCurrentIp` is false
  }

  // Return cached IP if available and still valid
  if (ipCache.value && Date.now() - ipCache.timestamp < ipCache.ttl) {
    return ipCache.value;
  }

  // Configure proxy agent if proxy is provided
  const httpsAgent = proxy ? new HttpsProxyAgent(proxy) : undefined;

  // Create an Axios instance with timeout and custom headers
  const axiosInstance = axios.create({
    timeout,
    httpsAgent,
    headers: { "User-Agent": "CDKTF-IP-Helper/2.0" },
  });

  try {
    // Use pRetry to attempt fetching the IP from endpoints
    const ip = await pRetry(
      async () => {
        for (const endpoint of endpoints) {
          try {
            const response = await Promise.race([
              axiosInstance.get(endpoint),
              setTimeout(timeout, `Request to ${endpoint} timed out`).then(() => {
                throw new Error(`Timeout after ${timeout}ms`);
              }),
            ]);

            // Determine the correct IP field based on the endpoint
            if (endpoint.includes("ipify")) {
              return `${response.data.ip}/32`;
            } else if (endpoint.includes("ipinfo")) {
              return `${response.data.ip}/32`;
            } else if (endpoint.includes("ifconfig")) {
              return `${response.data.ip_addr}/32`;
            }
          } catch (error) {
            console.warn(`Failed to fetch IP from ${endpoint}:`, (error as Error).message);
            throw error; // Trigger retry for this endpoint
          }
        }
        throw new Error("All endpoints failed"); // Fallback error if all endpoints fail
      },
      {
        retries,
        onFailedAttempt: (error) => {
          console.warn(
            `Attempt ${error.attemptNumber} failed. ${error.retriesLeft} retries left. Error:`,
            (error as Error).message
          );
        },
      }
    );

    // Cache the fetched IP with a timestamp
    ipCache.value = ip;
    ipCache.timestamp = Date.now();
    return ip;
  } catch (error) {
    console.error("All IP fetch attempts failed:", (error as Error).message);
    return "0.0.0.0/0"; // Fallback IP range
  }
}

// Synchronous wrapper for CDKTF compatibility
export function getIpAddressSync(options?: IpFetchOptions): string {
  const { timeout = 3000 } = options || {};

  // Use deasync to make the async function synchronous
  const deasync = require("deasync");
  let done = false;
  let result = "0.0.0.0/0"; // Default to fallback IP range
  let error: Error | null = null;

  getIpAddress(options)
    .then((ip) => {
      result = ip;
      done = true;
    })
    .catch((err) => {
      error = err;
      done = true;
    });

  // Wait synchronously until the async function resolves or rejects
  const startTime = Date.now();
  while (!done) {
    if (Date.now() - startTime > timeout + 1000) {
      throw new Error(`Timeout exceeded ${timeout + 1000}ms`);
    }
    deasync.sleep(100); // Add a small delay to prevent CPU thrashing
  }

  if (error) {
    throw error; // Re-throw the captured error
  }
  return result;
}
