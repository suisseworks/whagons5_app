/**
 * FaIcon – FontAwesome 6 Pro icon component.
 *
 * Wraps @fortawesome/react-native-fontawesome to render any FA6 Pro icon
 * by its dash-case name (e.g. "broom", "vacuum", "people-group").
 *
 * Supports solid (fas), regular (far), and brand (fab) styles.
 */

import React, { useMemo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { findIconDefinition, IconDefinition, IconPrefix, IconName } from '@fortawesome/fontawesome-svg-core';
import { library } from '@fortawesome/fontawesome-svg-core';
import { fas } from '@fortawesome/pro-solid-svg-icons';
import { far } from '@fortawesome/pro-regular-svg-icons';
import { fab } from '@fortawesome/free-brands-svg-icons';

// Register all icon packs once at module load
library.add(fas, far, fab);

interface FaIconProps {
  /** Icon name in dash-case, e.g. "broom", "vacuum", "people-group" */
  name: string;
  /** Icon style: solid (default), regular, or brand */
  solid?: boolean;
  /** Whether this is a brand icon (fab) */
  brand?: boolean;
  /** Icon size in pixels */
  size?: number;
  /** Icon color */
  color?: string;
}

const FALLBACK_ICON: IconDefinition = findIconDefinition({ prefix: 'far', iconName: 'building' });

export const FaIcon: React.FC<FaIconProps> = React.memo(({
  name,
  solid = true,
  brand = false,
  size = 16,
  color = '#000000',
}) => {
  const icon = useMemo(() => {
    const prefix: IconPrefix = brand ? 'fab' : solid ? 'fas' : 'far';
    const def = findIconDefinition({ prefix, iconName: name as IconName });
    if (def) return def;

    // Try other prefixes as fallback
    if (prefix !== 'fas') {
      const solidDef = findIconDefinition({ prefix: 'fas', iconName: name as IconName });
      if (solidDef) return solidDef;
    }
    if (prefix !== 'far') {
      const regularDef = findIconDefinition({ prefix: 'far', iconName: name as IconName });
      if (regularDef) return regularDef;
    }

    return FALLBACK_ICON;
  }, [name, solid, brand]);

  return <FontAwesomeIcon icon={icon} size={size} color={color} />;
});
