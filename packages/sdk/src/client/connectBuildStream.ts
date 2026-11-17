export type BuildStreamEvent = Record<string, any> & {
  inferenceId?: string;
};

export type BuildStreamMessage = {
  streamId?: string;
  status?: string;
  type?: string;
  event?: BuildStreamEvent;
  error?: { message?: string };
};

export const connectBuildStream = (
  stream: { id: string; url: string },
  options: {
    apiKey?: string;
    onMessage: (message: BuildStreamMessage) => void;
    onClose?: () => void;
    onError?: () => void;
  }
): WebSocket => {
  const url = new URL(stream.url);
  if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
    throw new Error('Invalid build stream URL');
  }
  const socket = new WebSocket(url);
  socket.addEventListener('open', () => {
    if (options.apiKey) socket.send(JSON.stringify({ apiKey: options.apiKey }));
  });
  socket.addEventListener('message', (event) => {
    try {
      options.onMessage(JSON.parse(String(event.data)) as BuildStreamMessage);
    } catch {
      /* Ignore malformed stream data. */
    }
  });
  socket.addEventListener('close', () => options.onClose?.());
  socket.addEventListener('error', () => options.onError?.());
  return socket;
};
