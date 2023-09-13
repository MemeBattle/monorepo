import { NextResponse } from 'next/server'

export async function GET(_request: Request, { params }: { params: { locale: string } }) {
  return NextResponse.json({ data: `Hello from a ${params.locale} feed` })
}
