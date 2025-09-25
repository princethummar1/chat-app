# MERN Chat App

## Project Structure

This project is organized using the MVC (Model-View-Controller) pattern for the backend and a modular component structure for the frontend.

### Backend (server/)
- **models/**: Contains Mongoose schemas for `User`, `Conversation`, and `Message`.
- **controllers/**: Contains business logic for conversations and other features.
- **routes/**: Handles API endpoints and delegates logic to controllers.
- **uploads/**: Stores uploaded images for chat messages.
- **index.js**: Main server file, sets up Express, Socket.io, and connects all routes.

### Frontend (client/src/)
- **components/**: Reusable UI components (buttons, cards, avatars, etc.).
- **ActiveChat.js**: Main chat window logic, handles message display and sending.
- **ConversationList.js**: Lists all conversations for the user.
- **UserList.js**: Lists all users for starting new chats.
- **CreateGroupModal.js**: Modal for creating group chats.
- **ChatPage.js**: Main page for chat functionality, manages state and socket events.
- **utils/**: Utility functions (e.g., formatting last seen time).
- **lib/**: Shared logic/utilities.

## Key Features & Logic
- **Authentication**: User registration and login with JWT.
- **Real-time Messaging**: Uses Socket.io for instant message delivery and notifications.
- **Group Chat**: Create groups, send messages, and display sender names for each message.
- **Unread Message Count**: Tracks unread messages per user per conversation.
- **Online Status**: Shows which users are online or recently active.
- **Image Uploads**: Send images in chat, stored in the backend uploads folder.
- **MVC Structure**: Backend logic is separated for maintainability and scalability.

## How to Run
1. Install dependencies in both `server/` and `client/` folders:
   ```bash
   cd server && npm install
   cd ../client && npm install
   ```
2. Start the backend server:
   ```bash
   cd ../server
   npm start
   ```
3. Start the frontend React app:
   ```bash
   cd ../client
   npm start
   ```

## Customization & Extending
- Add new features by creating new controllers and routes in the backend.
- Create new UI components in `client/src/components` for frontend features.
- Use the provided utility functions for formatting and shared logic.

## License
MIT
