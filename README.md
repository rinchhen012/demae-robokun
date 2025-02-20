---

| _ \/ _ \| _ )/ _ \| |/ / | | | \| |
| / (_) | _ \ (_) | ' <| |_| | .` |
|_|_\\**_/|_**/\_**/|_|\_\\_**/|\_|\_|

# Demae Robokun - An AI-powered order management system for Demaecan

A web application for automating order management from Demae-can partner portal.

## Features

- Automated login to Demae-can partner portal
- Fetch and display orders in real-time
- Mark orders as delivered/active
- Local database storage for order history
- Modern and responsive UI

## Prerequisites

- Docker Desktop installed
- Git installed

## Setup

### Running with Docker (Recommended)

1. Clone the repository:

```bash
git clone <repository-url>
cd demae-robokun
```

2. Build and start the containers:

```bash
docker-compose up --build
```

The application will be available at:

- Local machine: `http://localhost:3000`
- Other devices: `http://<your-local-ip-address>:3000`

To stop the application:

```bash
docker-compose down
```

### Traditional Setup (Alternative)

If you prefer running without Docker, you'll need:

- Node.js 18+ installed
- npm or yarn package manager
- A Demae-can partner portal account

#### Installation Steps

1. Install dependencies:

```bash
npm install
```

2. Start Composer Agent:

```bash
docker run -d -p 3001:3001 --name composer-agent ghcr.io/browser-actions/composer-agent
```

3. Database Setup:

```bash
# Remove existing database (if needed)
rm -f prisma/dev.db

# Generate Prisma client and create database
npx prisma generate
npx prisma db push
```

4. Start Development Server:

```bash
npm run dev -- -H 0.0.0.0
```

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

### Troubleshooting

#### Docker Issues

1. Make sure Docker Desktop is running
2. Try rebuilding the containers:
   ```bash
   docker-compose down
   docker-compose up --build
   ```
3. Check container logs:
   ```bash
   docker-compose logs
   ```

#### Network Access

1. Check Firewall Settings:

   - Windows: Open Windows Defender Firewall → Allow an app through firewall → Add Node.js and port 3000
   - Linux: Check UFW settings: `sudo ufw status` and allow port 3000 if needed

2. Network Issues:
   - Ensure both devices are on the same network
   - Some networks (public Wi-Fi) may block device-to-device connections
   - Try temporarily disabling firewall for testing

## Development

- Built with Next.js 14
- Uses Composer Agent for web automation
- Prisma with SQLite for database
- Tailwind CSS for styling
- TypeScript for type safety

## License

MIT
