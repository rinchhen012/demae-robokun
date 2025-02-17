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

## Setup

1. Clone the repository and install dependencies:

```bash
git clone <repository-url>
cd demae-robokun
npm install
```

2. Set up the database:

```bash
npx prisma generate
npx prisma db push
```

3. Start the development server:

```bash
npm run dev
```

The application will be available at `http://localhost:3000`

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
- Uses Playwright for web automation
- Prisma with SQLite for database
- Tailwind CSS for styling
- TypeScript for type safety

## License

MIT
