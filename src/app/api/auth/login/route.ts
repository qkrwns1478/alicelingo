import { NextResponse } from 'next/server';
import { createClient } from '../../../../utils/supabase/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body;

    const supabase = await createClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return NextResponse.json(
        { success: false, message: '이메일 또는 비밀번호가 잘못되었습니다.' }, 
        { status: 401 }
      );
    }

    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', data.user.id)
      .single();

    return NextResponse.json({ 
      success: true, 
      message: '로그인 성공', 
      user: { ...data.user, role: userData?.role }
    }, { status: 200 });

  } catch (error) {
    return NextResponse.json(
      { success: false, message: '서버에서 오류가 발생했습니다.' }, 
      { status: 500 }
    );
  }
}