import { Request, Response } from 'express';
import { pool } from '../config/database';
import { comparePassword, generateToken } from '../utils/auth';
import { StoreLoginRequest } from '../models/types';

export const storeAccountLogin = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { lottery_ac_no, lottery_pw }: StoreLoginRequest = req.body;

    if (!lottery_ac_no || !lottery_pw) {
      res
        .status(400)
        .json({ error: 'Lottery account number and password are required' });
      return;
    }

    if (!/^\d{8}$/.test(lottery_ac_no)) {
      res.status(400).json({ error: 'Lottery account number must be 8 digits' });
      return;
    }

    if (!/^\d{4}$/.test(lottery_pw)) {
      res.status(400).json({ error: 'Lottery password must be 4 digits' });
      return;
    }

    const [stores] = await pool.query(
      `SELECT
        store_id,
        store_name,
        owner_id,
        lottery_ac_no,
        lottery_pw
       FROM stores WHERE lottery_ac_no = ?`,
      [lottery_ac_no]
    );

    if ((stores as any[]).length === 0) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const store = (stores as any[])[0];
    const isValidPassword = await comparePassword(lottery_pw, store.lottery_pw);

    if (!isValidPassword) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const token = generateToken({
      id: store.store_id,
      email: `${store.lottery_ac_no}@lottostore`,
      full_name: store.store_name,
      role: 'store_account',
    });

    res.status(200).json({
      store: {
        id: store.store_id,
        owner_id: store.owner_id,
        store_name: store.store_name,
        lottery_ac_no: store.lottery_ac_no,
      },
      token,
      message: 'Store login successful',
    });
  } catch (error) {
    console.error('Store login error:', error);
    res.status(500).json({ error: 'Server error during store login' });
  }
};
