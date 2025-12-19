import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './config/database';

// Import routes
import authRoutes from './routes/authRoutes';
import storeRoutes from './routes/storeRoutes';
import lotteryRoutes from './routes/lotteryRoutes';
import scanRoutes from './routes/scanRoutes';
import reportRoutes from './routes/reportRoutes';
import superAdminRoutes from './routes/superAdminRoutes';
import chatRoutes from './routes/chatRoutes';
import notificationRoutes from './routes/notificationRoutes';
import ownerNotificationRoutes from './routes/ownerNotificationRoutes';

// Load environment variables
dotenv.config();

const app: Application = express();
const PORT = Number(process.env.PORT) || 4800;

// Middleware
app.use(cors({
  origin: '*', // Allow all origins for now (tighten this later in production)
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req: Request, res: Response, next) => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📨 ${req.method} ${req.path}`);
  console.log(`   Time: ${new Date().toISOString()}`);
  console.log(`   Headers:`, JSON.stringify(req.headers, null, 2));
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    console.log(`   Body:`, JSON.stringify(req.body, null, 2));
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Log response
  const originalSend = res.send;
  res.send = function (data: any) {
    console.log(`📤 Response ${res.statusCode} for ${req.method} ${req.path}`);
    console.log(`   Response:`, typeof data === 'string' ? data.substring(0, 200) : JSON.stringify(data).substring(0, 200));
    return originalSend.call(this, data);
  };

  next();
});

// Health check endpoint
app.get('/health', async (req: Request, res: Response) => {
  try {
    const { pool } = await import('./config/database');

    // Test database connection
    if (pool) {
      await pool.query('SELECT 1');
      res.status(200).json({
        status: 'OK',
        message: 'Lottery Pro Backend API is running',
        database: 'Connected',
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(503).json({
        status: 'ERROR',
        message: 'Database not initialized',
        database: 'Disconnected',
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    res.status(503).json({
      status: 'ERROR',
      message: 'Service unavailable',
      database: 'Error',
      timestamp: new Date().toISOString(),
    });
  }
});

// Simple POST test endpoint
app.post('/test', (req: Request, res: Response) => {
  console.log('🧪 TEST endpoint hit');
  console.log('Body received:', req.body);
  res.status(200).json({
    message: 'POST test successful',
    bodyReceived: req.body,
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/stores', storeRoutes);
app.use('/api/lottery', lotteryRoutes);
app.use('/api/lotteries', scanRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/super-admin', superAdminRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/settings', notificationRoutes);
app.use('/api/notifications', ownerNotificationRoutes);
// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
  });
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: any) => {
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.error('❌ ERROR HANDLER TRIGGERED');
  console.error('   Path:', req.method, req.path);
  console.error('   Error:', err.message);
  console.error('   Stack:', err.stack);
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message,
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.error('❌ UNHANDLED PROMISE REJECTION');
  console.error('   Reason:', reason);
  console.error('   Promise:', promise);
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.error('❌ UNCAUGHT EXCEPTION');
  console.error('   Error:', error.message);
  console.error('   Stack:', error.stack);
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});

// Start server
const startServer = async () => {
  try {
    console.log('🚀 Starting Lottery Pro Backend...');
    console.log('📊 Environment Check:');
    console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
    console.log(`   PORT: ${PORT}`);
    console.log(`   DB Host: ${process.env.MYSQLHOST || process.env.DB_HOST || 'NOT SET'}`);
    console.log(`   DB Name: ${process.env.MYSQLDATABASE || process.env.DB_NAME || 'NOT SET'}`);

    // Connect to database
    console.log('🔄 Connecting to database...');
    try {
      await connectDB();
      console.log('✅ Database connected successfully');
    } catch (dbError) {
      console.error('⚠️  Database connection failed, but continuing anyway');
      console.error('   Error:', dbError);
      // Continue without DB for now - don't crash
    }

    // Start listening - bind to 0.0.0.0 for Railway
    app.listen(PORT, '0.0.0.0', () => {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🎰 Lottery Pro Backend API');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`✓ Server running on port ${PORT}`);
      console.log(`✓ Listening on 0.0.0.0:${PORT}`);
      console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('Available Routes:');
      console.log('  GET    /health');
      console.log('  POST   /api/auth/register');
      console.log('  POST   /api/auth/login');
      console.log('  GET    /api/auth/profile');
      console.log('  PUT    /api/auth/profile');
      console.log('  DELETE /api/auth/profile');
      console.log('  POST   /api/stores/login');
      console.log('  GET    /api/stores');
      console.log('  GET    /api/stores/:id');
      console.log('  POST   /api/stores');
      console.log('  PUT    /api/stores/:id');
      console.log('  DELETE /api/stores/:id');
      console.log('  GET    /api/stores/clerk/:storeId');
      console.log('  GET    /api/stores/clerk/:storeId/dashboard');
      console.log('  GET    /api/lottery/types/store/:storeId');
      console.log('  GET    /api/lottery/store/:storeId/inventory');
      console.log('  GET    /api/lottery/store/:storeId/lottery/:lotteryTypeId');
      console.log('  PUT    /api/lottery/store/:storeId/lottery/:lotteryTypeId');
      console.log('  GET    /api/lottery/clerk/store/:storeId/inventory');
      console.log('  GET    /api/lottery/clerk/store/:storeId/lottery/:lotteryTypeId');
      console.log('  GET    /api/lottery/clerk/store/:storeId/types');
      console.log('  POST   /api/lotteries/scan');
      console.log('  GET    /api/lotteries/scan/history/:storeId');
      console.log('  GET    /api/notifications');
      console.log('  PATCH  /api/notifications/:notificationId/read');
      console.log('  POST   /api/notifications/mark-all-read');
      console.log('  GET    /api/settings/store/:storeId/notifications');
      console.log('  PUT    /api/settings/store/:storeId/notifications');
      console.log('  GET    /api/reports/store/:storeId');
      console.log('  GET    /api/reports/store/:storeId/lottery/:lotteryTypeId');
      console.log('  GET    /api/reports/store/:storeId/analytics');
      console.log('  GET    /api/reports/store/:storeId/daily');
      console.log('  GET    /api/reports/store/:storeId/monthly');
      console.log('  GET    /api/reports/store/:storeId/scan-logs');
      console.log('  POST   /api/super-admin/login');
      console.log('  GET    /api/super-admin/profile');
      console.log('  PUT    /api/super-admin/profile');
      console.log('  POST   /api/super-admin/lotteries');
      console.log('  GET    /api/super-admin/lotteries');
      console.log('  POST   /api/super-admin/lotteries/:lotteryId/assign');
      console.log('  DELETE /api/super-admin/lotteries/:lotteryId/assign');
      console.log('  PATCH  /api/super-admin/lotteries/:lotteryId/status');
      console.log('  PUT    /api/super-admin/lotteries/:lotteryId');
      console.log('  DELETE /api/super-admin/lotteries/:lotteryId');
      console.log('  POST   /api/chat/message');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    });
  } catch (error) {
    console.error('❌ FATAL: Failed to start server');
    console.error('Error details:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    process.exit(1);
  }
};

startServer();

export default app;
