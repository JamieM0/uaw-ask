export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const openRouterBase = 'https://openrouter.ai/api/v1';
    // The client calls a path like /v1/chat/completions, which is url.pathname
    const openRouterUrl = `${openRouterBase}${url.pathname}${url.search}`;

    const requestHeaders = new Headers(request.headers);
    const outgoingHeaders = new Headers();

    // Copy headers from incoming request, filtering out disallowed ones
    for (const [key, value] of requestHeaders.entries()) {
        const lowerKey = key.toLowerCase();
        if (!['host', 'authorization', 'cf-connecting-ip', 'cf-ipcountry', 'cf-ray', 'cf-visitor', 'cdn-loop', 'x-forwarded-host', 'x-forwarded-proto', 'x-real-ip'].includes(lowerKey)) {
            outgoingHeaders.set(key, value);
        }
    }

    // Set OpenRouter specific headers
    outgoingHeaders.set('Authorization', `Bearer ${env.OPENROUTER_API_KEY}`);
    if (url.origin) {
        outgoingHeaders.set('HTTPReferer', url.origin);
    }
    // outgoingHeaders.set('X-Title', 'My AI Webpage'); // Optional: For your analytics on OpenRouter

    let processedBody = request.body; // Default to original body (stream)

    // Modify body only for POST requests to chat completions endpoint
    if (request.method === 'POST' && url.pathname.endsWith('/chat/completions')) {
      if (!request.body) {
        return new Response(JSON.stringify({ error: 'POST request to /chat/completions requires a JSON body.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      try {
        const originalBodyJson = await request.json(); // This consumes request.body
        // The model is now expected to be in originalBodyJson.model, sent by the client.
        // We just need to ensure the original JSON body is stringified and sent.
        processedBody = JSON.stringify(originalBodyJson);
        outgoingHeaders.set('Content-Type', 'application/json'); // Body is now a JSON string
      } catch (e) {
        console.error('Error processing request body for /chat/completions:', e);
        return new Response(JSON.stringify({ error: 'Invalid JSON body for chat completions.', details: e.message }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    const openRouterRequest = new Request(openRouterUrl, {
      method: request.method,
      headers: outgoingHeaders,
      body: processedBody, // Use the (potentially modified) body
      redirect: 'follow'
    });

    try {
      const openRouterResponse = await fetch(openRouterRequest);

      // Handle streaming responses by forwarding them directly
      const contentType = openRouterResponse.headers.get("content-type");
      if (contentType && contentType.includes("text/event-stream")) {
        return new Response(openRouterResponse.body, {
          status: openRouterResponse.status,
          statusText: openRouterResponse.statusText,
          headers: openRouterResponse.headers // Forward all headers from OpenRouter
        });
      }

      // For non-streamed responses, return them as is.
      // The body (if any) is still a stream and will be passed to the client.
      return openRouterResponse;

    } catch (error) {
      console.error('Error fetching from OpenRouter:', error);
      return new Response(JSON.stringify({ error: 'Failed to connect to OpenRouter API.', details: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};