# Azure Functions - Backend Implementation Examples

This document provides sample code for the three Azure Functions you need to implement for authentication.

## Prerequisites

- Azure account with Function App created
- Azure SQL Database with the updated schema
- SendGrid account (for email)
- Visual Studio or VS Code with Azure Functions extension

## Function 1: Send Verification Code

**File: SendVerificationCode.cs**

```csharp
using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using System.Data.SqlClient;
using SendGrid;
using SendGrid.Helpers.Mail;

public static class SendVerificationCode
{
    private static readonly string ConnectionString = 
        Environment.GetEnvironmentVariable("SqlConnectionString");
    private static readonly string SendGridApiKey = 
        Environment.GetEnvironmentVariable("SendGridApiKey");
    private static readonly int ExpiryMinutes = 
        int.Parse(Environment.GetEnvironmentVariable("VerificationCodeExpiryMinutes") ?? "10");

    [FunctionName("SendVerificationCode")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "auth/send-verification-code")]
        HttpRequestMessage req,
        ILogger log)
    {
        try
        {
            // Parse request body
            string requestBody = await req.Content.ReadAsStringAsync();
            dynamic data = JsonConvert.DeserializeObject(requestBody);
            string email = data?.email;

            if (string.IsNullOrWhiteSpace(email))
                return new BadRequestObjectResult(new { message = "Email is required" });

            // Validate email format
            if (!IsValidEmail(email))
                return new BadRequestObjectResult(new { message = "Invalid email format" });

            // Generate 6-digit code
            string code = GenerateVerificationCode();
            DateTime expiresAt = DateTime.UtcNow.AddMinutes(ExpiryMinutes);

            // Store in database
            using (SqlConnection conn = new SqlConnection(ConnectionString))
            {
                await conn.OpenAsync();

                // Delete old codes for this email
                string deleteQuery = "DELETE FROM VerificationCode WHERE email = @email";
                using (SqlCommand deleteCmd = new SqlCommand(deleteQuery, conn))
                {
                    deleteCmd.Parameters.AddWithValue("@email", email);
                    await deleteCmd.ExecuteNonQueryAsync();
                }

                // Insert new code
                string insertQuery = @"
                    INSERT INTO VerificationCode (email, code, expires_at)
                    VALUES (@email, @code, @expiresAt)";

                using (SqlCommand insertCmd = new SqlCommand(insertQuery, conn))
                {
                    insertCmd.Parameters.AddWithValue("@email", email);
                    insertCmd.Parameters.AddWithValue("@code", code);
                    insertCmd.Parameters.AddWithValue("@expiresAt", expiresAt);
                    await insertCmd.ExecuteNonQueryAsync();
                }
            }

            // Send email
            await SendVerificationEmail(email, code, log);

            return new OkObjectResult(new { message = "Verification code sent" });
        }
        catch (Exception ex)
        {
            log.LogError($"Error sending verification code: {ex.Message}");
            return new StatusCodeResult(500);
        }
    }

    private static string GenerateVerificationCode()
    {
        Random random = new Random();
        return random.Next(100000, 999999).ToString();
    }

    private static bool IsValidEmail(string email)
    {
        try
        {
            var addr = new System.Net.Mail.MailAddress(email);
            return addr.Address == email;
        }
        catch
        {
            return false;
        }
    }

    private static async Task SendVerificationEmail(string email, string code, ILogger log)
    {
        var client = new SendGridClient(SendGridApiKey);
        var from = new EmailAddress("noreply@heyneighbor.app", "Hey Neighbor");
        var subject = "Your Hey Neighbor Verification Code";
        var to = new EmailAddress(email);
        var plainTextContent = $@"
Your verification code is: {code}

This code will expire in {ExpiryMinutes} minutes.

If you didn't request this code, you can safely ignore this email.

Best regards,
The Hey Neighbor Team";

        var htmlContent = $@"
<html>
<body style='font-family: Arial, sans-serif;'>
    <div style='max-width: 600px; margin: 0 auto; padding: 20px;'>
        <h1 style='color: #3b1b0d;'>Hey Neighbor</h1>
        <p>Your verification code is:</p>
        <h2 style='background-color: #f0f0f0; padding: 20px; text-align: center; letter-spacing: 2px;'>{code}</h2>
        <p style='color: #666;'>This code will expire in {ExpiryMinutes} minutes.</p>
        <p style='color: #666;'>If you didn't request this code, you can safely ignore this email.</p>
        <p>Best regards,<br>The Hey Neighbor Team</p>
    </div>
</body>
</html>";

        var msg = new SendGridMessage()
        {
            From = from,
            Subject = subject,
            PlainTextContent = plainTextContent,
            HtmlContent = htmlContent
        };
        msg.AddTo(to);

        var response = await client.SendEmailAsync(msg);
        log.LogInformation($"Email sent with status code: {response.StatusCode}");
    }
}
```

## Function 2: Verify Code

**File: VerifyCode.cs**

```csharp
using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using System.Data.SqlClient;

public static class VerifyCode
{
    private static readonly string ConnectionString = 
        Environment.GetEnvironmentVariable("SqlConnectionString");

    [FunctionName("VerifyCode")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "auth/verify-code")]
        HttpRequestMessage req,
        ILogger log)
    {
        try
        {
            // Parse request body
            string requestBody = await req.Content.ReadAsStringAsync();
            dynamic data = JsonConvert.DeserializeObject(requestBody);
            string email = data?.email;
            string code = data?.code;

            if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(code))
                return new BadRequestObjectResult(new { message = "Email and code are required" });

            using (SqlConnection conn = new SqlConnection(ConnectionString))
            {
                await conn.OpenAsync();

                // Check verification code
                string query = @"
                    SELECT code, expires_at, verified 
                    FROM VerificationCode 
                    WHERE email = @email 
                    ORDER BY created_at DESC";

                using (SqlCommand cmd = new SqlCommand(query, conn))
                {
                    cmd.Parameters.AddWithValue("@email", email);
                    using (SqlDataReader reader = await cmd.ExecuteReaderAsync())
                    {
                        if (!reader.HasRows)
                            return new BadRequestObjectResult(new { message = "No verification code found for this email" });

                        await reader.ReadAsync();
                        string storedCode = reader["code"].ToString();
                        DateTime expiresAt = (DateTime)reader["expires_at"];

                        // Check if expired
                        if (DateTime.UtcNow > expiresAt)
                        {
                            return new BadRequestObjectResult(new { message = "Verification code has expired" });
                        }

                        // Check if code matches
                        if (code != storedCode)
                        {
                            return new BadRequestObjectResult(new { message = "Invalid verification code" });
                        }

                        // Mark as verified
                        string updateQuery = "UPDATE VerificationCode SET verified = 1 WHERE email = @email";
                        using (SqlCommand updateCmd = new SqlCommand(updateQuery, conn))
                        {
                            updateCmd.Parameters.AddWithValue("@email", email);
                            await updateCmd.ExecuteNonQueryAsync();
                        }
                    }
                }
            }

            return new OkObjectResult(new { message = "Code verified successfully" });
        }
        catch (Exception ex)
        {
            log.LogError($"Error verifying code: {ex.Message}");
            return new StatusCodeResult(500);
        }
    }
}
```

## Function 3: Get or Create User

**File: GetOrCreateUser.cs**

```csharp
using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using System.Data.SqlClient;

public class UserData
{
    [JsonProperty("user_id")]
    public int UserId { get; set; }

    [JsonProperty("email")]
    public string Email { get; set; }

    [JsonProperty("name")]
    public string Name { get; set; }

    [JsonProperty("profile_picture")]
    public string ProfilePicture { get; set; }
}

public static class GetOrCreateUser
{
    private static readonly string ConnectionString = 
        Environment.GetEnvironmentVariable("SqlConnectionString");

    [FunctionName("GetOrCreateUser")]
    public static async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "auth/get-or-create-user")]
        HttpRequestMessage req,
        ILogger log)
    {
        try
        {
            // Parse request body
            string requestBody = await req.Content.ReadAsStringAsync();
            dynamic data = JsonConvert.DeserializeObject(requestBody);
            string email = data?.email;

            if (string.IsNullOrWhiteSpace(email))
                return new BadRequestObjectResult(new { message = "Email is required" });

            using (SqlConnection conn = new SqlConnection(ConnectionString))
            {
                await conn.OpenAsync();

                // Check if user exists
                string selectQuery = "SELECT user_id, name, profile_picture FROM app_user WHERE email = @email";
                using (SqlCommand selectCmd = new SqlCommand(selectQuery, conn))
                {
                    selectCmd.Parameters.AddWithValue("@email", email);
                    using (SqlDataReader reader = await selectCmd.ExecuteReaderAsync())
                    {
                        if (reader.HasRows)
                        {
                            // User exists
                            await reader.ReadAsync();
                            var user = new UserData
                            {
                                UserId = (int)reader["user_id"],
                                Email = email,
                                Name = reader["name"].ToString(),
                                ProfilePicture = reader["profile_picture"]?.ToString()
                            };

                            return new OkObjectResult(user);
                        }
                    }
                }

                // User doesn't exist, create new one
                string name = ExtractNameFromEmail(email);
                string insertQuery = @"
                    INSERT INTO app_user (email, name, profile_picture)
                    VALUES (@email, @name, NULL);
                    SELECT CAST(SCOPE_IDENTITY() as int);";

                int newUserId;
                using (SqlCommand insertCmd = new SqlCommand(insertQuery, conn))
                {
                    insertCmd.Parameters.AddWithValue("@email", email);
                    insertCmd.Parameters.AddWithValue("@name", name);
                    newUserId = (int)await insertCmd.ExecuteScalarAsync();
                }

                var newUser = new UserData
                {
                    UserId = newUserId,
                    Email = email,
                    Name = name,
                    ProfilePicture = null
                };

                return new OkObjectResult(newUser);
            }
        }
        catch (Exception ex)
        {
            log.LogError($"Error getting or creating user: {ex.Message}");
            return new StatusCodeResult(500);
        }
    }

    private static string ExtractNameFromEmail(string email)
    {
        // Extract name from email (e.g., "john.doe@example.com" -> "John Doe")
        string namePart = email.Split('@')[0];
        namePart = namePart.Replace(".", " ");
        return System.Globalization.CultureInfo.CurrentCulture.TextInfo.ToTitleCase(namePart);
    }
}
```

## Environment Variables (local.settings.json)

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "DefaultEndpointsProtocol=https;AccountName=...",
    "FUNCTIONS_WORKER_RUNTIME": "dotnet",
    "SqlConnectionString": "Server=tcp:your-server.database.windows.net;Database=heyneighbor;User Id=youruser;Password=yourpassword;",
    "SendGridApiKey": "SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "VerificationCodeExpiryMinutes": "10",
    "CodeLength": "6"
  }
}
```

## Package Dependencies (csproj)

```xml
<ItemGroup>
    <PackageReference Include="Microsoft.Azure.WebJobs.Extensions.Storage" Version="5.0.0" />
    <PackageReference Include="SendGrid" Version="9.28.0" />
    <PackageReference Include="System.Data.SqlClient" Version="4.8.5" />
</ItemGroup>
```

## CORS Configuration (Azure Portal)

1. Go to your Function App in Azure Portal
2. Settings → CORS
3. Add allowed origins:
   - `http://localhost:8081` (Expo development)
   - `http://127.0.0.1:8081`
   - Your production domain

## Deployment

```bash
# Using Azure CLI
az functionapp publish your-function-app-name --build remote

# Or using Visual Studio
# Right-click project → Publish → Select Function App → Publish
```

## Testing with Postman

**1. Send Verification Code:**
```
POST /api/auth/send-verification-code
Content-Type: application/json

{
  "email": "test@example.com"
}
```

**2. Verify Code:**
```
POST /api/auth/verify-code
Content-Type: application/json

{
  "email": "test@example.com",
  "code": "123456"
}
```

**3. Get or Create User:**
```
POST /api/auth/get-or-create-user
Content-Type: application/json

{
  "email": "test@example.com"
}
```

## Notes

- All timestamps use UTC
- Codes are 6 digits by default
- Expired codes should be cleaned up periodically (consider adding a scheduled function)
- Hash or encrypt codes before storing in production
- Implement rate limiting to prevent brute force attacks
