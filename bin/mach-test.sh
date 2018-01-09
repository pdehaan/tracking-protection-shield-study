# Copying build-includes into dist/${ADDON_NAME}/ for testing in tree
BASE_DIR="$(dirname "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)")"
ADDON_NAME=$(node -p -e "require('./package.json').name");
mkdir -p dist/$ADDON_NAME
while read -r LINE || [[ -n "${LINE}" ]]; do
  mkdir -p "$(dirname "dist/${ADDON_NAME}/${LINE}")"
  cp -r "${BASE_DIR}/addon/${LINE}" "$(dirname "dist/${ADDON_NAME}/${LINE}")"
done < "${BASE_DIR}/build-includes.txt"