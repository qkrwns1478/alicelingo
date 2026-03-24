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

    let { data: userData, error: userError } = await supabase
      .from('users')
      .select('role, nickname, plan')
      .eq('id', data.user.id)
      .single();

    // 레코드가 존재하지 않는 경우 (PGRST116 에러) 즉시 생성하여 무결성 보장
    if (!userData || (userError && userError.code === 'PGRST116')) {
      const nowKst = new Date(new Date().getTime() + 9 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

      const newUser = {
        id: data.user.id,
        email: email,
        role: 'user',
        nickname: email.split('@')[0],
        plan: 'Free',
        daily_eval_count: 0,
        last_eval_date: nowKst
      };
      
      const { error: insertError } = await supabase.from('users').insert(newUser);
      
      if (insertError) {
        throw new Error('유저 프로필 초기화에 실패했습니다.');
      }
      userData = newUser as any;
    }

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