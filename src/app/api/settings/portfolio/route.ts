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
    console.log(
      '[API] Portfolio Settings POST:',
      JSON.stringify(body, null, 2)
    );

    const { weeklyAmount, fxFeePercent, targets = [] } = body;

    // Validate inputs
    if (!Array.isArray(targets)) {
      throw new Error('Targets must be an array');
    }

    // Deduplicate targets by symbol to prevent unique constraint violations
    const uniqueTargetsMap = new Map();
    targets.forEach((t: any) => {
      if (t.symbol) {
        uniqueTargetsMap.set(t.symbol, t);
      }
    });
    const uniqueTargets = Array.from(uniqueTargetsMap.values());

    console.log(
      `[API] Processing ${uniqueTargets.length} unique targets (original: ${targets.length})`
    );

    // Use transaction to ensure consistency
    const settings = await prisma.$transaction(async (tx) => {
      // Find existing settings
      const existing = await tx.portfolioSettings.findFirst();

      if (existing) {
        // Update existing
        // First, remove old targets
        await tx.allocationTarget.deleteMany({
          where: { portfolioSettingsId: existing.id },
        });

        // Then update settings and re-create targets
        return await tx.portfolioSettings.update({
          where: { id: existing.id },
          data: {
            weeklyAmount,
            fxFeePercent,
            targets: {
              create: uniqueTargets.map((t: any) => ({
                symbol: t.symbol,
                targetWeight: parseFloat(t.targetWeight),
                currency: t.currency || 'CAD', // Default to CAD if missing
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
              create: uniqueTargets.map((t: any) => ({
                symbol: t.symbol,
                targetWeight: parseFloat(t.targetWeight),
                currency: t.currency || 'CAD',
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
      {
        error: 'Failed to save settings',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
