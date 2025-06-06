export default {
  async fetch(request, env) {
    // Ensure this matches the path you are calling from your frontend
    // The OpenAI client in index.html will make requests like /v1/chat/completions
    // These need to be appended to the GitHub Models inference endpoint.
    const url = new URL(request.url);
    const githubModelsBase = 'https://models.github.ai/inference';

    // Construct the new URL for the GitHub Models API
    // e.g., if request is to worker_url/v1/chat/completions,
    // this becomes https://models.github.ai/inference/v1/chat/completions
    const githubUrl = `${githubModelsBase}${url.pathname}${url.search}`;

    // Create a new headers object from the original request,
    // but remove headers that might cause issues or are specific to Cloudflare
    const newHeaders = new Headers(request.headers);
    newHeaders.delete('x-forwarded-host');
    newHeaders.delete('x-forwarded-proto');
    newHeaders.delete('cf-connecting-ip');
    newHeaders.delete('cf-ipcountry');
    newHeaders.delete('cf-ray');
    newHeaders.delete('cf-visitor');
    newHeaders.delete('cdn-loop');
    newHeaders.delete('host'); // GitHub Models will expect its own host header
    newHeaders.delete('authorization'); // Remove any incoming auth header (e.g., the dummy key)

    // Add the GitHub Token from the environment variable
    newHeaders.set('Authorization', `Bearer ${env.GITHUB_TOKEN}`);

    // Create a new request to forward to GitHub Models
    // Ensure method, headers, and body are passed through
    const githubRequest = new Request(githubUrl, {
      method: request.method,
      headers: newHeaders,
      body: request.body,
      redirect: 'follow' // Important for GitHub Models API
    });

    try {
      const githubResponse = await fetch(githubRequest);

      // If the response is streamable (like for chat completions),
      // we need to handle it as a stream.
      if (githubResponse.headers.get("content-type") &&
          githubResponse.headers.get("content-type").includes("text/event-stream")) {
        
        // Return the stream directly to the client
        return new Response(githubResponse.body, {
          status: githubResponse.status,
          statusText: githubResponse.statusText,
          headers: githubResponse.headers
        });
      }

      // For non-streamed responses, just return them as is.
      return githubResponse;

    } catch (error) {
      console.error('Error fetching from GitHub Models:', error);
      return new Response(JSON.stringify({ error: 'Failed to connect to GitHub Models API', details: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};