import { NextResponse } from 'next/server';
import { createClient } from '../../../../utils/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) return NextResponse.json({ success: false }, { status: 401 });

  const { data } = await supabase
    .from('users')
    .select('email, nickname')
    .eq('id', user.id)
    .single();

  return NextResponse.json({ success: true, user: data });
}

export async function PUT(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) return NextResponse.json({ success: false }, { status: 401 });

  const { nickname } = await request.json();
  const { error } = await supabase
    .from('users')
    .update({ nickname })
    .eq('id', user.id);

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 400 });
  
  return NextResponse.json({ success: true, message: '닉네임이 변경되었습니다.' });
}