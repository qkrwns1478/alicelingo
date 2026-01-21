import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const body = await request.json();
  const { id, password } = body;

  // TODO: 실제 로그인 기능 구현
  if (id === process.env.ADMIN_ID && password === process.env.ADMIN_PW) {
    const cookieStore = await cookies();
    cookieStore.set('auth_token', 'authenticated', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24,
      path: '/',
    });

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ success: false }, { status: 401 });
}