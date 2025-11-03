# ⚡ SolarScan API

**SolarScan API** is the intelligent backend engine that powers the [SolarScan](https://github.com/MuneebAbro/SolarScan_Website) web app.  
It reads electricity bills, extracts data using AI, and provides personalized solar recommendations — showing system size, cost, savings, payback time, and environmental impact.

---

## 🚀 Features
- 🧾 **Smart Bill Parsing** — Uses Groq’s LLM to analyze and extract data from bill text.  
- ☀️ **Solar Recommendation Engine** — Calculates ideal solar system size (kW).  
- 💰 **ROI & Payback Estimator** — Shows installation cost, savings, and return time.  
- 🌿 **Sustainability Metrics** — Estimates annual CO₂ reduction for each user.  
- 💸 **Budget Mode** — Suggests partial setups if the user provides a smaller budget.  
- 📊 **Structured JSON Output** — Perfect for frontend or mobile integration.  

---

## 🧠 How It Works
1. User uploads or scans an electricity bill in the SolarScan web app.  
2. The API parses usage, cost, and tariff information.  
3. It factors in local solar installation costs in **Pakistan 🇵🇰**.  
4. Returns clean, structured solar recommendations and energy insights.

---

## 🔧 Tech Stack
- **Runtime:** Node.js  
- **Language:** JavaScript / TypeScript  
- **Framework:** Next.js API-style handler  
- **AI Model:** Groq LLaMA-3.3-70B-Versatile  
- **Hosting:** Vercel / Render / Cloudflare Workers  

---

## ⚙️ Environment Variables
| Variable | Description |
|-----------|--------------|
| `GROQ_API_KEY` | Your Groq API key for LLM responses |
| `NODE_ENV` | Set to `production` or `development` |

---

## 💚 Purpose
Designed for **green energy innovation**, **cost efficiency**, and **climate sustainability**.  
The goal: make solar adoption simpler, smarter, and financially transparent for everyone.

---

## 👨‍💻 Author
**Muneeb Abro**  
Frontend: [SolarScan Web App](https://github.com/MuneebAbro/SolarScan_Website)  
Backend: [SolarScan API]()  

---

## 📜 License
Licensed under the [MIT License](LICENSE).
