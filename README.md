# Artistic Weather Forecast Application

Transform weather forecasts into generative art through an AI chain.

## Features

- **Location-based weather data** via OpenWeatherMap API
- **AI-powered artistic interpretation** using Google Gemini 2.0 Flash
- **Image generation** through Cloudflare Workers AI
- **Mobile-first responsive design**
- **Multiple artistic styles** (Stable Diffusion, FLUX, DreamShaper, Realistic)
- **Save and share functionality**

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up your API keys as Cloudflare secrets:
   ```bash
   wrangler secret put OPENWEATHER_API_KEY
   wrangler secret put GEMINI_API_KEY
   ```

3. Deploy to Cloudflare Workers:
   ```bash
   npm run deploy
   ```

## Development

Run locally:
```bash
npm run dev
```

## API Endpoints

- `GET /` - Main application interface
- `POST /api/weather` - Fetch weather data for a location
- `POST /api/generate-art` - Generate artistic interpretation

## Technical Architecture

1. **Weather Data Collection**: OpenWeatherMap API provides 2-3 day forecasts
2. **AI Analysis**: Google Gemini 2.0 Flash interprets weather data into artistic concepts
3. **Image Generation**: Cloudflare Workers AI generates artwork based on the interpretation
4. **Responsive UI**: Mobile-first design with loading states and debug information

## Security

All API keys are stored securely as Cloudflare Workers secrets and never exposed to the client.