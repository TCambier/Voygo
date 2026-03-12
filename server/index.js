import app from './app.js';
import { config } from './config.js';

app.listen(config.port, () => {
  console.log(`Voygo server running on http://localhost:${config.port}`);
});
