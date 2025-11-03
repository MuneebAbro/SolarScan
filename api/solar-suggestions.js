import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

export default async function handler(req, res) {
  // Set CORS headers for Android app
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      units,
      cost,
      billingDate,
      location,
      roofArea,
      additionalInfo
    } = req.body;

    // Validate required fields
    if (!units || !cost) {
      return res.status(400).json({
        error: 'Missing required fields: units and cost are required'
      });
    }

    // Calculate cost per unit
    const costPerUnit = cost / units;

    // Build prompt for Groq
    const prompt = buildSolarPrompt({
      units,
      cost,
      costPerUnit,
      billingDate,
      location,
      roofArea,
      additionalInfo
    });

    // Call Groq API
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: 'You are an expert solar energy consultant specializing in helping homeowners and businesses reduce their electricity costs through solar panel installations. Provide detailed, practical, and actionable advice.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.7,
      max_tokens: 2048,
      top_p: 1
    });

    const suggestions = chatCompletion.choices[0]?.message?.content || 'No suggestions available';

    return res.status(200).json({
      success: true,
      suggestions,
      metadata: {
        units,
        cost,
        costPerUnit: costPerUnit.toFixed(4),
        billingDate,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error generating solar suggestions:', error);
    
    return res.status(500).json({
      error: 'Failed to generate suggestions',
      message: error.message
    });
  }
}

function buildSolarPrompt(data) {
  const {
    units,
    cost,
    costPerUnit,
    billingDate,
    location,
    roofArea,
    additionalInfo
  } = data;

  let prompt = `I need advice on reducing electricity costs using solar panels based on the following electric bill information:\n\n`;
  
  prompt += `- Monthly Energy Consumption: ${units} kWh\n`;
  prompt += `- Total Monthly Bill Cost: ${cost} (currency)\n`;
  prompt += `- Cost Per Unit: ${costPerUnit.toFixed(4)} (currency per kWh)\n`;
  
  if (billingDate) {
    prompt += `- Billing Date: ${billingDate}\n`;
  }
  
  if (location) {
    prompt += `- Location: ${location}\n`;
  }
  
  if (roofArea) {
    prompt += `- Available Roof Area: ${roofArea} sq ft\n`;
  }
  
  if (additionalInfo) {
    prompt += `- Additional Information: ${additionalInfo}\n`;
  }

  prompt += `\nPlease provide:\n`;
  prompt += `1. Estimated solar panel system size needed (in kW)\n`;
  prompt += `2. Approximate installation costs\n`;
  prompt += `3. Expected monthly savings\n`;
  prompt += `4. Payback period estimation\n`;
  prompt += `5. Environmental impact (CO2 reduction)\n`;
  prompt += `6. Specific recommendations based on the consumption pattern\n`;
  prompt += `7. Any government incentives or subsidies that might apply\n`;
  prompt += `8. Maintenance considerations\n`;
  
  return prompt;
}
