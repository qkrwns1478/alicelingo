import { NextResponse } from 'next/server';
import { createClient } from '../../../../utils/supabase/server';

export async function POST() {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: true, message: '성공적으로 로그아웃 되었습니다.' },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, message: '서버에서 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}