# Solar Cost Reduction Backend API

A Vercel serverless backend that provides AI-powered solar panel cost reduction suggestions using the Groq API. Designed to integrate with Android native apps.

## Features

- 🌞 AI-powered solar panel recommendations
- ⚡ Serverless architecture on Vercel
- 🔌 RESTful API endpoint
- 🤖 Powered by Groq API (LLaMA 3.3 70B model)
- 📱 CORS-enabled for mobile apps
- 💰 Cost estimation and payback period analysis

## Project Structure

```
D:\aac\
├── api/
│   └── solar-suggestions.js    # Main API endpoint
├── package.json                # Dependencies
├── vercel.json                 # Vercel configuration
├── .env.example               # Environment variables template
├── .gitignore                 # Git ignore rules
└── README.md                  # Documentation
```

## Prerequisites

- Node.js 18.x or higher
- Groq API key ([Get one here](https://console.groq.com))
- Vercel account ([Sign up here](https://vercel.com))

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the root directory:

```bash
GROQ_API_KEY=your_groq_api_key_here
```

To get your Groq API key:
1. Visit [https://console.groq.com](https://console.groq.com)
2. Sign up or log in
3. Navigate to API Keys section
4. Create a new API key

### 3. Test Locally

```bash
npm run dev
```

The API will be available at `http://localhost:3000/api/solar-suggestions`

### 4. Deploy to Vercel

#### Option A: Using Vercel CLI

```bash
npm install -g vercel
vercel login
vercel --prod
```

#### Option B: Using Vercel Dashboard

1. Push your code to GitHub
2. Go to [vercel.com/new](https://vercel.com/new)
3. Import your repository
4. Add environment variable: `GROQ_API_KEY`
5. Deploy

**Important:** After deployment, add your `GROQ_API_KEY` in the Vercel dashboard:
- Go to your project settings
- Navigate to Environment Variables
- Add `GROQ_API_KEY` with your key value
- Redeploy if necessary

## API Documentation

### Endpoint

**POST** `/api/solar-suggestions`

### Request Headers

```
Content-Type: application/json
```

### Request Body

```json
{
  "units": 500,
  "cost": 60,
  "billingDate": "2025-11-03",
  "location": "California, USA",
  "roofArea": 1000,
  "additionalInfo": "South-facing roof, no shade"
}
```

#### Required Fields

- `units` (integer): Monthly energy consumption in kWh (matches your database `units` field)
- `cost` (integer): Total monthly bill cost in your currency (matches your database `cost` field)

#### Optional Fields

- `billingDate` (string): Billing date from your electric bill (matches your database `billing_date` field)
- `location` (string): Geographic location
- `roofArea` (number): Available roof area in square feet
- `additionalInfo` (string): Any additional relevant information

### Response

```json
{
  "success": true,
  "suggestions": "Detailed AI-generated recommendations...",
  "metadata": {
    "units": 500,
    "cost": 60,
    "costPerUnit": "0.1200",
    "billingDate": "2025-11-03",
    "timestamp": "2025-11-03T09:53:20.000Z"
  }
}
```

### Error Response

```json
{
  "error": "Error description",
  "message": "Detailed error message"
}
```

## Android Integration Example

### Using Retrofit (Kotlin)

```kotlin
// API Interface
interface SolarApiService {
    @POST("solar-suggestions")
    suspend fun getSolarSuggestions(
        @Body request: SolarRequest
    ): Response<SolarResponse>
}

// Data Classes
data class SolarRequest(
    val units: Int,
    val cost: Int,
    val billingDate: String? = null,
    val location: String? = null,
    val roofArea: Double? = null,
    val additionalInfo: String? = null
)

data class SolarResponse(
    val success: Boolean,
    val suggestions: String,
    val metadata: Metadata
)

data class Metadata(
    val units: Int,
    val cost: Int,
    val costPerUnit: String,
    val billingDate: String?,
    val timestamp: String
)

// Usage
val retrofit = Retrofit.Builder()
    .baseUrl("https://your-app.vercel.app/api/")
    .addConverterFactory(GsonConverterFactory.create())
    .build()

val service = retrofit.create(SolarApiService::class.java)

lifecycleScope.launch {
    // Get latest bill from your database
    val latestBill = DatabaseHelper.getInstance(context).getLatestBill()
    
    latestBill?.let { bill ->
        val request = SolarRequest(
            units = bill.units,
            cost = bill.cost,
            billingDate = bill.billingDate,
            location = "California, USA" // Optional: add from user preferences
        )
        
        val response = service.getSolarSuggestions(request)
        if (response.isSuccessful) {
            val suggestions = response.body()?.suggestions
            // Display suggestions in your UI
        }
    }
}
```

### Using OkHttp (Java)

```java
OkHttpClient client = new OkHttpClient();
MediaType JSON = MediaType.parse("application/json; charset=utf-8");

String json = "{"
    + "\"units\": 500,"
    + "\"cost\": 60,"
    + "\"billingDate\": \"2025-11-03\","
    + "\"location\": \"California, USA\""
    + "}";

RequestBody body = RequestBody.create(json, JSON);
Request request = new Request.Builder()
    .url("https://your-app.vercel.app/api/solar-suggestions")
    .post(body)
    .build();

client.newCall(request).enqueue(new Callback() {
    @Override
    public void onResponse(Call call, Response response) {
        // Handle response
    }

    @Override
    public void onFailure(Call call, IOException e) {
        // Handle error
    }
});
```

## Testing the API

### Using cURL

```bash
curl -X POST https://your-app.vercel.app/api/solar-suggestions \
  -H "Content-Type: application/json" \
  -d '{
    "units": 500,
    "cost": 60,
    "billingDate": "2025-11-03",
    "location": "California, USA",
    "roofArea": 1000
  }'
```

### Using PowerShell

```powershell
$body = @{
    units = 500
    cost = 60
    billingDate = "2025-11-03"
    location = "California, USA"
    roofArea = 1000
} | ConvertTo-Json

Invoke-RestMethod -Uri "https://your-app.vercel.app/api/solar-suggestions" `
    -Method Post `
    -Body $body `
    -ContentType "application/json"
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GROQ_API_KEY` | Your Groq API key | Yes |

## Tech Stack

- **Runtime:** Node.js 18+
- **Framework:** Vercel Serverless Functions
- **AI Model:** Groq (LLaMA 3.3 70B Versatile)
- **Language:** JavaScript (ES Modules)

## Troubleshooting

### "Missing required fields" error
Ensure your request includes both `units` and `cost` fields from your database.

### CORS errors
The API already includes CORS headers. If you still face issues, verify your request origin.

### Deployment fails
- Check that `GROQ_API_KEY` is set in Vercel environment variables
- Ensure all dependencies are in `package.json`

### API timeout
Groq API responses might take a few seconds. Consider increasing timeout in your Android app.

## License

MIT

## Support

For issues or questions, please open an issue in the repository.
