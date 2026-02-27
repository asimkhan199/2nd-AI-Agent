# Leads CSV Upload Template

To upload leads into the Sarah AI Orchestration Engine, your CSV file should follow this structure.

## Required Columns
- **Name**: The full name of the lead (e.g., "John Smith").
- **Phone**: The phone number in E.164 format or standard local format (e.g., "+14165550199" or "416-555-0199").
- **Address**: The service address (e.g., "123 Maple St, Toronto, ON").
- **City**: The city for neighborhood-specific pitching (e.g., "Toronto").

## Optional Columns
- **Persona**: (For simulation testing) 'Friendly', 'Busy', 'Rude', 'Skeptical', 'Interested'.
- **LastServiceDate**: Date of last cleaning to help Sarah personalize the pitch.
- **Notes**: Any specific details (e.g., "Has 3 dogs", "Allergy concerns").

## Example CSV Content
```csv
Name,Phone,Address,City,Persona,Notes
John Miller,416-555-1234,123 Oak Ave,Toronto,Friendly,Interested in allergy relief
Sarah Connor,416-555-5678,456 Pine St,Toronto,Busy,Call back if no answer
Robert Paulson,416-555-9012,789 Birch Ln,Toronto,Rude,DNC if aggressive
```

## How to Upload
1. Click the **"Upload Leads CSV"** button on the Dashboard.
2. Select your `.csv` file.
3. The orchestration engine will automatically parse the file and begin routing calls to available AI agents in the cluster.
