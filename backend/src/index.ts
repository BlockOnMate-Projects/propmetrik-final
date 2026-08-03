import { createApp } from './bootstrap/createApp';
import { startServer } from './bootstrap/server';

const app = createApp();
const server = startServer(app);

export { app, server };
