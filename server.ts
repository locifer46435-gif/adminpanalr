import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  const DATA_FILE = path.join(process.cwd(), "data.json");

  // Initialize data file if it doesn't exist
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({
      tasks: [],
      categories: [],
      accounts: [],
      devices: [],
      notes: [],
      links: [],
      reports: []
    }));
  }

  const getData = () => JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  const saveData = (data: any) => fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

  // API Routes
  app.get("/api/data", (req, res) => {
    res.json(getData());
  });

  app.post("/api/update", (req, res) => {
    saveData(req.body);
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
