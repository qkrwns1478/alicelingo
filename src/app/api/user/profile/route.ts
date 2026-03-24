import { NextResponse } from 'next/server';
import { createClient } from '../../../../utils/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) return NextResponse.json({ success: false }, { status: 401 });

  const { data } = await supabase
    .from('users')
    .select('email, nickname, plan, daily_eval_count, last_eval_date')
    .eq('id', user.id)
    .single();

  if (!data) return NextResponse.json({ success: false }, { status: 404 });

  const now = new Date();
  const kstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const today = kstDate.toISOString().split('T')[0];

  let currentCount = data.daily_eval_count || 0;
  let lastDate = data.last_eval_date;

  if (lastDate !== today) {
    currentCount = 0;
    lastDate = today;
  }

  return NextResponse.json({ 
    success: true, 
    user: {
      ...data,
      daily_eval_count: currentCount,
      last_eval_date: lastDate
    } 
  });
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