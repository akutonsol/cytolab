'use client';

import { Card, Result } from 'antd';
import { navItemByPath } from '@/lib/nav';

export function ComingSoon({ path }: { path: string }) {
  const item = navItemByPath(path);
  return (
    <Card>
      <Result
        status="info"
        title={item?.label ?? 'Module'}
        subTitle={
          item?.phase
            ? `This module is coming in Phase ${item.phase}.`
            : 'This module is not available yet.'
        }
      />
    </Card>
  );
}
