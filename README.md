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

### 1. Clone and Install Dependencies

```bash
git clone <repository-url>
cd demae-robokun
npm install
```

### 2. Start Composer Agent

#### Windows

```powershell
# Using PowerShell
docker run -d -p 3001:3001 --name composer-agent ghcr.io/browser-actions/composer-agent

# If container already exists
docker start composer-agent
```

#### Linux

```bash
# Using bash
sudo docker run -d -p 3001:3001 --name composer-agent ghcr.io/browser-actions/composer-agent

# If container already exists
sudo docker start composer-agent
```

### 3. Database Setup

#### Windows

```powershell
# Remove existing database (if needed)
Remove-Item -Path prisma/dev.db -ErrorAction SilentlyContinue

# Generate Prisma client and create database
npx prisma generate
npx prisma db push
```

#### Linux

```bash
# Remove existing database (if needed)
rm -f prisma/dev.db

# Generate Prisma client and create database
npx prisma generate
npx prisma db push
```

### 4. Start Development Server

#### Windows

```powershell
# Using PowerShell
npm run dev -- -H 0.0.0.0
```

#### Linux

```bash
# Using bash
npm run dev -- -H 0.0.0.0
```

The application will be available at:

- Local machine: `http://localhost:3000`
- Other devices: `http://<your-local-ip-address>:3000`

### Accessing from Other Devices

#### Finding Your IP Address

##### Windows

1. Open PowerShell or Command Prompt
2. Type `ipconfig`
3. Look for "IPv4 Address" under your active network adapter
   ```
   IPv4 Address. . . . . . . . . . . : 192.168.1.xxx
   ```

##### Linux

1. Open terminal
2. Type `ip addr` or `hostname -I`
3. Look for your local IP address (usually starts with 192.168 or 10.0)
   ```
   inet 192.168.1.xxx/24
   ```

#### Accessing from iPad/Tablet

1. Ensure your device is on the same network as your computer
2. Open your browser
3. Enter `http://<your-computer-ip>:3000`
   Example: `http://192.168.1.xxx:3000`

#### Troubleshooting Network Access

1. Check Firewall Settings:

   - Windows: Open Windows Defender Firewall → Allow an app through firewall → Add Node.js and port 3000
   - Linux: Check UFW settings: `sudo ufw status` and allow port 3000 if needed

2. Network Issues:
   - Ensure both devices are on the same network
   - Some networks (public Wi-Fi) may block device-to-device connections
   - Try temporarily disabling firewall for testing

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
