# Demae Robokun

A web application for automating order management from Demae-can partner portal.

## Features

- Automated login to Demae-can partner portal
- Fetch and display orders in real-time
- Mark orders as delivered/active
- Local database storage for order history
- Modern and responsive UI

## Prerequisites

- Node.js 18+ installed
- npm or yarn package manager
- A Demae-can partner portal account
- Docker installed (for Composer Agent)

## Setup

1. Clone the repository and install dependencies:

```bash
git clone <repository-url>
cd demae-robokun
npm install
```

2. Start Composer Agent:

```bash
docker run -d -p 3001:3001 --name composer-agent ghcr.io/browser-actions/composer-agent
```

3. Set up the database:

```bash
npx prisma generate
npx prisma db push
```

4. Start the development server:

```bash
npm run dev -- -H 0.0.0.0
```

The application will be available at:

- Local machine: `http://localhost:3000`
- Other devices: `http://<your-local-ip-address>:3000`

### Accessing from iPad

1. **Find your computer's IP address**:

   - Windows: Open CMD and type `ipconfig` (look for IPv4 Address)
   - Mac: Open System Settings → Network → Wi-Fi → Details (or type `ifconfig` in terminal)
   - Example IP might look like: `192.168.1.5`

2. **Connect your iPad**:

   - Ensure your iPad is connected to the same Wi-Fi network as your computer
   - Open Safari on your iPad
   - Enter `http://<your-computer-ip>:3000` in the address bar
   - Example: `http://192.168.1.5:3000`

3. **Troubleshooting**:
   - If connection fails, check your computer's firewall settings
   - Try temporarily disabling your computer's firewall
   - Make sure your iPad and computer are on the same Wi-Fi network
   - Some networks (like public Wi-Fi) might block device-to-device connections

Note: For security reasons, only use this method on trusted networks.

## Usage

1. Enter your Demae-can partner portal email and password
2. Click "Fetch Orders" to retrieve the latest orders
3. Use the action buttons to mark orders as delivered or toggle their active status
4. The orders table will automatically update to reflect any changes

## Deployment

This application can be deployed for free on Vercel:

1. Create a Vercel account at https://vercel.com
2. Install Vercel CLI:

```bash
npm install -g vercel
```

3. Deploy the application:

```bash
vercel
```

## Development

- Built with Next.js 14
- Uses Composer Agent for web automation
- Prisma with SQLite for database
- Tailwind CSS for styling
- TypeScript for type safety

## License

MIT
