export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    if (url.pathname === '/') {
      return new Response(await getIndexHTML(), {
        headers: {
          'Content-Type': 'text/html',
        },
      });
    }
    
    if (url.pathname === '/api/weather' && request.method === 'POST') {
      return handleWeatherRequest(request, env);
    }
    
    if (url.pathname === '/api/generate-art' && request.method === 'POST') {
      return handleArtGeneration(request, env);
    }
    
    return new Response('Not Found', { status: 404 });
  },
};

async function handleWeatherRequest(request, env) {
  try {
    const { location } = await request.json();
    
    if (!location) {
      return new Response(JSON.stringify({ error: 'Location is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    const weatherData = await fetchWeatherData(location, env.OPENWEATHER_API_KEY);
    
    return new Response(JSON.stringify(weatherData), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function handleArtGeneration(request, env) {
  try {
    const { weatherData, artisticStyle } = await request.json();
    
    console.log('Starting art generation for:', weatherData.location);
    console.log('Artistic style:', artisticStyle);
    
    if (!weatherData || !weatherData.forecast) {
      throw new Error('Invalid weather data provided');
    }
    
    const artPrompt = await generateArtPrompt(weatherData, env.GEMINI_API_KEY);
    console.log('Generated art prompt length:', artPrompt.length);
    
    const imageUrl = await generateArtwork(artPrompt, artisticStyle, env);
    console.log('Generated image URL type:', typeof imageUrl);
    console.log('Image URL length:', imageUrl.length);
    
    return new Response(JSON.stringify({ 
      artPrompt, 
      imageUrl,
      weatherData,
      debug: {
        promptLength: artPrompt.length,
        style: artisticStyle,
        timestamp: new Date().toISOString()
      }
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Art generation error:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function fetchWeatherData(location, apiKey) {
  const geocodingUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(location)}&limit=1&appid=${apiKey}`;
  
  const geoResponse = await fetch(geocodingUrl);
  const geoData = await geoResponse.json();
  
  if (!geoData.length) {
    throw new Error('Location not found');
  }
  
  const { lat, lon, name, country } = geoData[0];
  
  const weatherUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;
  
  const weatherResponse = await fetch(weatherUrl);
  const weatherData = await weatherResponse.json();
  
  const processedData = {
    location: `${name}, ${country}`,
    coordinates: { lat, lon },
    forecast: weatherData.list.slice(0, 8).map(item => ({
      datetime: item.dt_txt,
      temperature: Math.round(item.main.temp),
      humidity: item.main.humidity,
      pressure: item.main.pressure,
      description: item.weather[0].description,
      main: item.weather[0].main,
      icon: item.weather[0].icon,
      windSpeed: item.wind.speed,
      windDirection: item.wind.deg,
      clouds: item.clouds.all
    }))
  };
  
  return processedData;
}

async function generateArtPrompt(weatherData, geminiApiKey) {
  const weatherSummary = weatherData.forecast.map(f => 
    `${f.datetime}: ${f.description}, ${f.temperature}°C, humidity ${f.humidity}%, wind ${f.windSpeed}m/s`
  ).join('\n');
  
  const prompt = `Transform this weather forecast into an artistic concept for image generation. Focus on the WEATHER PHENOMENA themselves, not decorative elements or settings.

Weather Data for ${weatherData.location}:
${weatherSummary}

Create a detailed artistic prompt that captures the essence and patterns of these weather conditions. Think about:
- Visual metaphors for temperature variations
- Artistic representation of weather phenomena (rain, clouds, wind, etc.)
- Color palettes that reflect the atmospheric conditions
- Abstract or impressionistic interpretations of meteorological data
- Dynamic elements that show weather changes over time

Respond with a concise but vivid artistic prompt (under 200 words) that focuses purely on weather phenomena visualization, not landscapes or environments.`;

  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': geminiApiKey,
    },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: prompt
        }]
      }],
      generationConfig: {
        maxOutputTokens: 300,
        temperature: 0.7
      }
    }),
  });
  
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(`Gemini API error: ${data.error?.message || 'Unknown error'}`);
  }
  
  return data.candidates[0].content.parts[0].text;
}

async function generateArtwork(prompt, style, env) {
  try {
    const modelName = getModelByStyle(style);
    
    console.log(`=== IMAGE GENERATION DEBUG ===`);
    console.log(`Model: ${modelName}`);
    console.log(`Style: ${style}`);
    console.log(`Full prompt: ${prompt}`);
    console.log(`Prompt length: ${prompt.length}`);
    
    const aiParams = getModelParameters(modelName, prompt);
    console.log('AI parameters:', JSON.stringify(aiParams, null, 2));
    
    console.log('Calling env.AI.run()...');
    const response = await env.AI.run(modelName, aiParams);
    
    console.log('AI response received');
    console.log('Response type:', typeof response);
    console.log('Response constructor:', response?.constructor?.name);
    console.log('Response keys:', Object.keys(response || {}));
    console.log('Full response:', JSON.stringify(response, null, 2));
    
    if (!response) {
      throw new Error('No response from AI model');
    }
    
    // Check different possible response formats
    if (response.image) {
      console.log('Found response.image');
    } else if (response instanceof Uint8Array) {
      console.log('Response is direct Uint8Array');
      const base64String = btoa(String.fromCharCode(...response));
      const dataUrl = `data:image/png;base64,${base64String}`;
      console.log('Converted direct Uint8Array to data URL, length:', dataUrl.length);
      return dataUrl;
    } else if (response instanceof ArrayBuffer) {
      console.log('Response is direct ArrayBuffer');
      const uint8Array = new Uint8Array(response);
      const base64String = btoa(String.fromCharCode(...uint8Array));
      const dataUrl = `data:image/png;base64,${base64String}`;
      console.log('Converted direct ArrayBuffer to data URL, length:', dataUrl.length);
      return dataUrl;
    } else {
      console.log('Checking other possible properties...');
      console.log('response.result:', !!response.result);
      console.log('response.data:', !!response.data);
      console.log('response.output:', !!response.output);
      console.log('response.generated_image:', !!response.generated_image);
    }
    
    // For image generation, the response should have an image property
    if (response.image) {
      console.log('Found image in response');
      console.log('Image type:', typeof response.image);
      console.log('Image length:', response.image.length);
      
      // Convert Uint8Array to base64
      let base64String;
      if (response.image instanceof Uint8Array) {
        base64String = btoa(String.fromCharCode(...response.image));
      } else if (typeof response.image === 'string') {
        base64String = response.image;
      } else {
        console.log('Converting image data to Uint8Array...');
        const uint8Array = new Uint8Array(response.image);
        base64String = btoa(String.fromCharCode(...uint8Array));
      }
      
      console.log('Base64 string length:', base64String.length);
      console.log('Base64 preview:', base64String.substring(0, 50) + '...');
      
      const dataUrl = `data:image/png;base64,${base64String}`;
      console.log('Final data URL length:', dataUrl.length);
      console.log('=== IMAGE GENERATION DEBUG END ===');
      
      return dataUrl;
    } else if (response.result?.image) {
      console.log('Found image in response.result');
      const base64String = typeof response.result.image === 'string' 
        ? response.result.image 
        : btoa(String.fromCharCode(...new Uint8Array(response.result.image)));
      const dataUrl = `data:image/png;base64,${base64String}`;
      return dataUrl;
    } else if (response.data) {
      console.log('Found response.data, treating as image data');
      const uint8Array = new Uint8Array(response.data);
      const base64String = btoa(String.fromCharCode(...uint8Array));
      const dataUrl = `data:image/png;base64,${base64String}`;
      return dataUrl;
    } else {
      console.error('No image property found in response structure:', response);
      console.error('Available properties:', Object.keys(response || {}));
      throw new Error(`No image data in AI response. Response keys: ${Object.keys(response || {}).join(', ')}`);
    }
  } catch (error) {
    console.error('Error in generateArtwork:', error);
    console.error('Error stack:', error.stack);
    throw new Error(`Image generation failed: ${error.message}`);
  }
}

function getModelByStyle(style) {
  const models = {
    'stable-diffusion': '@cf/stabilityai/stable-diffusion-xl-base-1.0',
    'flux': '@cf/black-forest-labs/flux-1-schnell',
    'dreamshaper': '@cf/lykon/dreamshaper-8-lcm',
    'realistic': '@cf/bytedance/stable-diffusion-xl-lightning'
  };
  
  const selectedModel = models[style] || models['stable-diffusion'];
  console.log(`Style '${style}' mapped to model: ${selectedModel}`);
  return selectedModel;
}

function getModelParameters(modelName, prompt) {
  // Different models might need different parameters
  const baseParams = {
    prompt: prompt
  };
  
  if (modelName.includes('flux')) {
    return {
      ...baseParams,
      num_steps: 4,  // FLUX Schnell is optimized for fewer steps
    };
  } else if (modelName.includes('lightning')) {
    return {
      ...baseParams,
      num_steps: 8,  // Lightning models are fast
    };
  } else if (modelName.includes('dreamshaper')) {
    return {
      ...baseParams,
      num_steps: 8,
      guidance: 7.5,
    };
  } else {
    // Default Stable Diffusion parameters
    return {
      ...baseParams,
      num_steps: 20,
      guidance: 7.5,
      strength: 1,
    };
  }
}

async function getIndexHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Artistic Weather Forecast</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
            color: #333;
        }
        
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: rgba(255, 255, 255, 0.95);
            border-radius: 20px;
            padding: 30px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
        }
        
        h1 {
            text-align: center;
            margin-bottom: 30px;
            color: #2c3e50;
            font-size: 2rem;
            font-weight: 300;
        }
        
        .input-section {
            background: #f8f9fa;
            padding: 25px;
            border-radius: 15px;
            margin-bottom: 30px;
        }
        
        .form-group {
            margin-bottom: 20px;
        }
        
        label {
            display: block;
            margin-bottom: 8px;
            font-weight: 500;
            color: #555;
        }
        
        input[type="text"], select {
            width: 100%;
            padding: 12px 15px;
            border: 2px solid #e1e8ed;
            border-radius: 10px;
            font-size: 16px;
            transition: border-color 0.3s ease;
        }
        
        input[type="text"]:focus, select:focus {
            outline: none;
            border-color: #667eea;
        }
        
        .generate-btn {
            width: 100%;
            padding: 15px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 10px;
            font-size: 18px;
            font-weight: 500;
            cursor: pointer;
            transition: transform 0.2s ease;
        }
        
        .generate-btn:hover {
            transform: translateY(-2px);
        }
        
        .generate-btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
        }
        
        .loading {
            text-align: center;
            padding: 40px;
            display: none;
        }
        
        .spinner {
            width: 50px;
            height: 50px;
            border: 4px solid #f3f3f3;
            border-top: 4px solid #667eea;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 20px;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        .debug-section {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 10px;
            margin: 20px 0;
            display: none;
        }
        
        .debug-title {
            font-weight: 600;
            margin-bottom: 10px;
            color: #666;
        }
        
        .weather-data {
            background: white;
            padding: 15px;
            border-radius: 8px;
            white-space: pre-wrap;
            font-family: monospace;
            font-size: 12px;
            max-height: 200px;
            overflow-y: auto;
        }
        
        .result-section {
            display: none;
            text-align: center;
        }
        
        .art-prompt {
            background: #e8f4fd;
            padding: 20px;
            border-radius: 10px;
            margin: 20px 0;
            border-left: 4px solid #667eea;
        }
        
        .generated-image {
            max-width: 100%;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
            margin: 20px 0;
        }
        
        .action-buttons {
            display: flex;
            gap: 10px;
            justify-content: center;
            margin-top: 20px;
        }
        
        .action-btn {
            padding: 10px 20px;
            border: 2px solid #667eea;
            background: white;
            color: #667eea;
            border-radius: 25px;
            cursor: pointer;
            text-decoration: none;
            font-weight: 500;
            transition: all 0.3s ease;
        }
        
        .action-btn:hover {
            background: #667eea;
            color: white;
        }
        
        .error {
            background: #ffe6e6;
            color: #d63031;
            padding: 15px;
            border-radius: 10px;
            margin: 20px 0;
            border-left: 4px solid #d63031;
            display: none;
        }
        
        @media (max-width: 768px) {
            .container {
                margin: 0;
                padding: 20px;
                border-radius: 0;
            }
            
            h1 {
                font-size: 1.5rem;
            }
            
            .action-buttons {
                flex-direction: column;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎨 Artistic Weather Forecast</h1>
        
        <div class="input-section">
            <div class="form-group">
                <label for="location">Location</label>
                <input type="text" id="location" placeholder="Enter city name (e.g., Paris, London, New York)" required>
            </div>
            
            <div class="form-group">
                <label for="style">Artistic Style</label>
                <select id="style">
                    <option value="stable-diffusion">Stable Diffusion</option>
                    <option value="flux">FLUX</option>
                    <option value="dreamshaper">DreamShaper</option>
                    <option value="realistic">Realistic</option>
                </select>
            </div>
            
            <button class="generate-btn" onclick="generateArt()">Generate Artistic Forecast</button>
        </div>
        
        <div class="loading" id="loading">
            <div class="spinner"></div>
            <p>Creating your artistic weather forecast...</p>
        </div>
        
        <div class="error" id="error"></div>
        
        <div class="debug-section" id="debug">
            <div class="debug-title">Weather Data (Debug)</div>
            <div class="weather-data" id="weatherData"></div>
        </div>
        
        <div class="result-section" id="result">
            <div class="art-prompt" id="artPrompt"></div>
            <img class="generated-image" id="generatedImage" alt="Generated artwork">
            <div class="action-buttons">
                <button class="action-btn" onclick="saveImage()">Save Image</button>
                <button class="action-btn" onclick="shareResult()">Share</button>
                <button class="action-btn" onclick="generateNew()">Generate New</button>
            </div>
        </div>
    </div>

    <script>
        let currentImageData = null;
        let currentWeatherData = null;

        async function generateArt() {
            const location = document.getElementById('location').value.trim();
            const style = document.getElementById('style').value;
            
            if (!location) {
                showError('Please enter a location');
                return;
            }
            
            hideAll();
            showLoading();
            
            try {
                const weatherResponse = await fetch('/api/weather', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ location })
                });
                
                if (!weatherResponse.ok) {
                    const error = await weatherResponse.json();
                    throw new Error(error.error || 'Failed to fetch weather data');
                }
                
                const weatherData = await weatherResponse.json();
                currentWeatherData = weatherData;
                
                showDebugData(weatherData);
                
                const artResponse = await fetch('/api/generate-art', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ weatherData, artisticStyle: style })
                });
                
                if (!artResponse.ok) {
                    const error = await artResponse.json();
                    throw new Error(error.error || 'Failed to generate artwork');
                }
                
                const result = await artResponse.json();
                currentImageData = result;
                
                showResult(result);
                
            } catch (error) {
                console.error('Error:', error);
                showError(error.message);
            } finally {
                hideLoading();
            }
        }
        
        function hideAll() {
            document.getElementById('loading').style.display = 'none';
            document.getElementById('error').style.display = 'none';
            document.getElementById('debug').style.display = 'none';
            document.getElementById('result').style.display = 'none';
        }
        
        function showLoading() {
            document.getElementById('loading').style.display = 'block';
        }
        
        function hideLoading() {
            document.getElementById('loading').style.display = 'none';
        }
        
        function showError(message) {
            const errorDiv = document.getElementById('error');
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';
        }
        
        function showDebugData(data) {
            document.getElementById('weatherData').textContent = JSON.stringify(data, null, 2);
            document.getElementById('debug').style.display = 'block';
        }
        
        function showResult(result) {
            document.getElementById('artPrompt').textContent = result.artPrompt;
            document.getElementById('generatedImage').src = result.imageUrl;
            document.getElementById('result').style.display = 'block';
        }
        
        function saveImage() {
            if (currentImageData && currentImageData.imageUrl) {
                const link = document.createElement('a');
                link.href = currentImageData.imageUrl;
                link.download = \`artistic-weather-\${Date.now()}.png\`;
                link.click();
            }
        }
        
        function shareResult() {
            if (navigator.share && currentImageData) {
                navigator.share({
                    title: 'Artistic Weather Forecast',
                    text: currentImageData.artPrompt,
                    url: window.location.href
                });
            } else {
                const text = \`Check out this artistic weather forecast: \${currentImageData.artPrompt}\`;
                navigator.clipboard.writeText(text);
                alert('Content copied to clipboard!');
            }
        }
        
        function generateNew() {
            hideAll();
            document.getElementById('location').value = '';
        }
        
        document.getElementById('location').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                generateArt();
            }
        });
    </script>
</body>
</html>`;
}