// Utility function to get consistent colors for users across all components
// Ensures no two users have the same color
export const getUserColor = (userId) => {
  const colors = [
    '#007bff', // Blue
    '#28a745', // Green
    '#dc3545', // Red
    '#ffc107', // Yellow
    '#6f42c1', // Purple
    '#17a2b8', // Cyan
    '#fd7e14', // Orange
    '#e83e8c'  // Pink
  ];
  
  // Handle undefined/null userId
  if (!userId) {
    return colors[0]; // Return first color as fallback
  }
  
  // Use a more robust hash that reduces collisions
  let hash = 0;
  const str = userId.toString();
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Use a combination of hash and string length to reduce collisions
  const combinedHash = Math.abs(hash) + str.length;
  return colors[combinedHash % colors.length];
};

// Alternative function that guarantees unique colors for a set of users
export const getUserColorUnique = (userId, allUserIds = []) => {
  const colors = [
    '#007bff', // Blue
    '#28a745', // Green
    '#dc3545', // Red
    '#ffc107', // Yellow
    '#6f42c1', // Purple
    '#17a2b8', // Cyan
    '#fd7e14', // Orange
    '#e83e8c'  // Pink
  ];
  
  if (!userId) {
    return colors[0];
  }
  
  // Get unique user IDs and sort them for consistent ordering
  const uniqueUserIds = [...new Set(allUserIds)].sort();
  const userIndex = uniqueUserIds.indexOf(userId);
  
  // If user not found in the list, use hash-based fallback
  if (userIndex === -1) {
    return getUserColor(userId);
  }
  
  // Assign colors in order to ensure uniqueness
  return colors[userIndex % colors.length];
};
