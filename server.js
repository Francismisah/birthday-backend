// --- RSVP GraphQL Email API Server (Node.js/Express + GraphQL) ---
// This file defines a GraphQL endpoint (/graphql) with a mutation
// to handle RSVP submission and send an email notification using Nodemailer.
// Requires: express, nodemailer, cors, dotenv, graphql, and express-graphql.

// 1. Load environment variables first using require()
const dotenv = require("dotenv");
dotenv.config();

const express = require("express");
const { createHandler } = require("graphql-http/lib/use/express");
const { buildSchema } = require("graphql");
const nodemailer = require("nodemailer");
const cors = require("cors");

const app = express();
// FIX 1: Use process.env.PORT for cloud hosting (Render) or fall back to 3000 locally.
const actualPort = process.env.PORT || 3000;

// Middleware Setup
// Enable CORS for all origins
app.use(cors());
// Parse incoming JSON payloads
app.use(express.json());

// Get credentials and recipient from environment variables
// REMINDER: EMAIL_PASS must be the 16-character App Password from Google.
const emailUser = process.env.EMAIL_USER;
const emailPass = process.env.EMAIL_PASS;
const recipientEmail = process.env.RECIPIENT_EMAIL;

// 2. Configure the Nodemailer transporter (kept outside the resolver for efficiency)
// FIX 2: Switched from 'service: gmail' to explicit host/port/secure settings
// for better stability and clarity on cloud platforms.
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com", // Explicit host
  port: 465, // Explicitly use the secure port
  secure: true, // Must be true for port 465
  auth: {
    user: emailUser,
    pass: emailPass,
  },
});

// 3. Define the GraphQL Schema
const schema = buildSchema(`
    # Enumeration for Attendance Status
    enum AttendanceStatus {
        ALONE
        WITH_PARTNER
        ABSENT
    }

    # Output type for the mutation
    type GuestConfirmation {
        name: String!
        email: String!
        message: String!
        success: Boolean!
    }

    # The single mutation available on this server
    type Mutation {
        addGuestRSVP(
            name: String!, 
            email: String!, 
            phoneNumber: String!, 
            attendanceStatus: AttendanceStatus!
        ): GuestConfirmation
    }

    # Entry point for queries (empty, as this is only for mutations)
    type Query {
        status: String
    }
`);

// 4. Define the Root Resolver
const root = {
  // Simple status query for server health check
  status: () => "RSVP GraphQL API is running.",

  // Resolver function for the mutation
  addGuestRSVP: async ({ name, email, phoneNumber, attendanceStatus }) => {
    // Validation check (from original logic)
    if (!emailUser || !emailPass || !recipientEmail) {
      console.error("Missing required environment variables.");
      // Throw a proper GraphQL error
      throw new Error(
        "Server configuration incomplete. Cannot send email. Please check EMAIL_USER, EMAIL_PASS, and RECIPIENT_EMAIL variables on Render."
      );
    }

    // Format the attendance status for the email body
    let statusText = "Unknown";
    switch (attendanceStatus) {
      case "ALONE":
        statusText = "Attending Alone (Confirmed)";
        break;
      case "WITH_PARTNER":
        statusText = "Attending With Partner (Confirmed)";
        break;
      case "ABSENT":
        statusText = "Will NOT be attending (Absent)";
        break;
    }

    // Create the email content
    const mailOptions = {
      // Note: Gmail may override the 'from' address with the account used in auth.user
      from: `"${name}" <${emailUser}>`,
      to: recipientEmail,
      subject: `[RSVP Confirmation] New Guest Response: ${name}`,
      html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                    <h2 style="color: #4CAF50;">New RSVP Submission Received (via GraphQL)</h2>
                    <p>A new guest has submitted their attendance confirmation for the event.</p>
                    <hr style="border: 1px solid #eee;">
                    
                    <table style="width: 100%; max-width: 500px; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 10px; background-color: #f7f7f7; font-weight: bold; width: 30%;">Full Name:</td>
                            <td style="padding: 10px; background-color: #ffffff;">${name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; background-color: #f7f7f7; font-weight: bold;">Email:</td>
                            <td style="padding: 10px; background-color: #ffffff;">${email}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; background-color: #f7f7f7; font-weight: bold;">Phone Number:</td>
                            <td style="padding: 10px; background-color: #ffffff;">${phoneNumber}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; background-color: #f7f7f7; font-weight: bold;">Attendance Status:</td>
                            <td style="padding: 10px; background-color: #ffffff; color: ${
                              attendanceStatus === "ABSENT"
                                ? "#D32F2F"
                                : "#388E3C"
                            }; font-weight: bold;">${statusText}</td>
                        </tr>
                    </table>
                    
                    <p style="margin-top: 20px; font-size: 0.9em; color: #777;">
                        (Guest email for direct reply: ${email})
                    </p>
                </div>
            `,
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log(`Email sent for guest: ${name}`);

      // Return the successful mutation result object
      return {
        name,
        email,
        success: true,
        message: "RSVP submitted successfully and notification email sent.",
      };
    } catch (error) {
      console.error("Error sending email:", error);
      // Throw an error that GraphQL will propagate to the client
      throw new Error(
        `Failed to send notification email. Please check your Nodemailer credentials/App Password: ${error.message}`
      );
    }
  },
};

// 5. Add a default route handler for the root path (/)
// This prevents the "Cannot GET /" or "Cannot POST /" error pages for the root URL.
app.get("/", (req, res) => {
  res.status(200).json({
    message: "RSVP GraphQL API is running.",
    endpoint: "/graphql",
  });
});

// 6. Mount the GraphQL handler on the /graphql endpoint
app.all(
  "/graphql",
  createHandler({
    schema: schema,
    rootValue: root,
    graphiql: true, // Enable the GraphiQL interface for testing
  })
);

// Start the server
app.listen(actualPort, () => {
  console.log(`RSVP GraphQL API server running on port ${actualPort}`);
  console.log(
    `GraphiQL interface available at http://localhost:${actualPort}/graphql`
  );
  console.log("Use CTRL+C to stop the server locally.");
});
