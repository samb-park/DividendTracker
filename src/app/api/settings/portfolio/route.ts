import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    const settings = await prisma.portfolioSettings.findFirst({
      include: {
        targets: true,
      },
    });

    if (!settings) {
      return NextResponse.json({
        weeklyAmount: 0,
        fxFeePercent: 1.5,
        targets: [],
      });
    }

    return NextResponse.json(settings);
  } catch (error) {
    console.error('Failed to fetch settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { weeklyAmount, fxFeePercent, targets } = body;

    // Use transaction to ensure consistency
    const settings = await prisma.$transaction(async (tx) => {
      // Find existing settings
      const existing = await tx.portfolioSettings.findFirst();

      if (existing) {
        // Update existing
        await tx.allocationTarget.deleteMany({
          where: { portfolioSettingsId: existing.id },
        });

        return await tx.portfolioSettings.update({
          where: { id: existing.id },
          data: {
            weeklyAmount,
            fxFeePercent,
            targets: {
              create: targets.map((t: any) => ({
                symbol: t.symbol,
                targetWeight: t.targetWeight,
                currency: t.currency,
              })),
            },
          },
          include: { targets: true },
        });
      } else {
        // Create new
        return await tx.portfolioSettings.create({
          data: {
            weeklyAmount,
            fxFeePercent,
            targets: {
              create: targets.map((t: any) => ({
                symbol: t.symbol,
                targetWeight: t.targetWeight,
                currency: t.currency,
              })),
            },
          },
          include: { targets: true },
        });
      }
    });

    return NextResponse.json(settings);
  } catch (error) {
    console.error('Failed to save settings:', error);
    return NextResponse.json(
      { error: 'Failed to save settings' },
      { status: 500 }
    );
  }
}
