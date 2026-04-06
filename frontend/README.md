# AquaponicsAI - Farm Operations Platform

A modern, professional frontend for the farm operations platform featuring AI Survey and Land Voice Survey planning engines.

## Features

### 🔐 Authentication
- User login and registration
- Token-based authentication
- Persistent sessions with localStorage
- Auto-recovery on page refresh

### 📊 Dashboard
- Welcome screen with user greeting
- Key metrics cards:
  - Revenue Potential
  - Operating Profit
  - Service Adoption Rate
  - Water pH Level
- Revenue vs Operating Cost chart (6-month view)
- Weekly Water Stability line chart
- System Snapshot panel
- Action Queue with alerts
- Quick Navigation shortcuts

### 🌱 AI Survey (Aquaponics Questionnaire)
- Multi-step question flow with progress tracking
- Support for text, number, and select input types
- AI-powered answer parsing and confirmation
- Back/undo functionality
- Survey completion with financial analysis
- Results dashboard with:
  - Projected revenue, costs, and profit
  - AI-generated recommendations
  - Report generation capability

### 🎤 Land Voice Survey
- Voice-enabled or text input
- Guided prompt sequence
- Multi-crop planning workflow
- Confirmation loop for each response
- Add multiple crops with individual metrics
- Financial dashboard generation:
  - Total revenue, cost, profit, and ROI
  - Crop-level breakdown table
  - Export to spreadsheet functionality

### 🏡 Farm Management
- Create and manage multiple farms
- Farm details (name, location, size, type)
- Water quality readings tracking:
  - pH level
  - Temperature
  - Dissolved oxygen
- Delete/edit farm records
- Historical readings view

### 📑 Reports
- Report history from completed surveys
- Filter by survey type (AI Survey / Land Voice)
- Multiple export formats:
  - PDF download
  - CSV export
  - JSON export
- Spreadsheet sync integration
- Report metadata (date, session ID, status)

## Technology Stack

- **React 18.3.1** - UI library
- **TypeScript** - Type safety
- **Tailwind CSS 4** - Styling
- **Radix UI** - Component primitives
- **Recharts** - Data visualization
- **Lucide React** - Icons
- **Vite** - Build tool

## Design System

### Colors
- **Primary**: Emerald green (#10b981) - Growth, nature, sustainability
- **Secondary**: Cyan (#06b6d4) - Water, aquaponics
- **Accent**: Purple - Voice/AI features
- **Warning**: Amber - Alerts and warnings
- **Error**: Red - Critical issues

### Components
- Modern card-based layouts
- Rounded corners (10px radius)
- Subtle shadows and borders
- Responsive grid layouts
- Mobile-first approach

## Key Workflows

### Authentication Flow
1. User lands on login page
2. Enter credentials (or use demo mode)
3. Token stored in localStorage
4. Redirect to dashboard
5. Auto-refresh token on 401

### AI Survey Flow
1. Start/resume session
2. Present question with progress bar
3. User answers (text/number/select)
4. AI parses and requests confirmation
5. Confirm or edit response
6. Move to next question
7. Complete survey → Generate analysis
8. Display results dashboard

### Land Voice Survey Flow
1. Start land planning session
2. Prompt for land area
3. For each crop:
   - Voice or text input
   - Collect name, area, yield, price
   - Confirm each value
   - Add to crops list
4. Ask "Add another crop?"
5. If yes, repeat; if no, generate dashboard
6. Display financial metrics and crop breakdown

### Farm Operations Flow
1. Select active farm from list
2. View farm details and metrics
3. Add water quality readings
4. View historical readings chart
5. Create new farms as needed

### Reports Flow
1. View report history
2. Select report by date/type
3. Download in preferred format (PDF/CSV/JSON)
4. Export to Google Sheets
5. Track download history

## State Management

- **App-level state**: Current view, user, auth token
- **Component-level state**: Form inputs, UI toggles
- **Persistent state**: localStorage for auth and session recovery
- **Session state**: Active survey progress, selected farm

## API Integration Points

All API calls are currently mocked for demo purposes. To integrate with your backend:

1. **Authentication**: `/api/auth/login`, `/api/auth/register`
2. **Surveys**: `/api/surveys/ai`, `/api/surveys/land`
3. **Analysis**: `/api/analysis/generate`
4. **Farms**: `/api/farms/*`
5. **Reports**: `/api/reports/*`
6. **Spreadsheet Sync**: `/api/sync/sheets`

## Mobile Responsive

- Hamburger menu on mobile devices
- Stacked layouts for tablets
- Touch-friendly buttons and inputs
- Responsive charts and tables
- Optimized for screens 320px+

## Future Enhancements

- Real API integration
- WebSocket for real-time updates
- Advanced analytics and predictions
- Multi-language support
- Dark mode toggle
- Export scheduler
- Batch operations
- Admin panel

## Getting Started

The application is already running in the Vite dev server. Simply interact with the preview to explore all features.

**Demo Mode**: Enter any email and password to login and explore the full application.
