require('dotenv').config();
const app = require('./backend/app');

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor arrancado en http://localhost:${PORT}`);
});
