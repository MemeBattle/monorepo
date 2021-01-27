import React, { memo } from 'react'

import * as styles from './Paper.module.scss'

export const Paper = memo(({ children }) => <div className={styles.paper}>{children}</div>)
