import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { db } from "../../database/connection";
import { config } from "../../config";

export class AuthController {
  
  // POST /api/auth/register (Apenas para o primeiro acesso/setup)
  public static async register(req: Request, res: Response): Promise<any> {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
      }

      // Verifica se já existe algum usuário cadastrado (Sistema é Single Admin)
      const usersCount = db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
      if (usersCount.count > 0) {
        return res.status(403).json({ error: "Admin user is already registered. Only one user is allowed." });
      }

      const id = uuidv4();
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      const stmt = db.prepare("INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)");
      stmt.run(id, username, passwordHash);

      const token = jwt.sign({ id, username }, config.JWT_SECRET, { expiresIn: "7d" });

      return res.status(201).json({ message: "Admin user registered successfully", token });
    } catch (error) {
      console.error("[Auth] Register error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  // POST /api/auth/login
  public static async login(req: Request, res: Response): Promise<any> {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
      }

      const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as any;
      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const token = jwt.sign(
        { id: user.id, username: user.username },
        config.JWT_SECRET,
        { expiresIn: "7d" } // Token dura bastante focado na experiência mobile
      );

      return res.json({ token, username: user.username });
    } catch (error) {
      console.error("[Auth] Login error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
}
