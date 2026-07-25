#!/usr/bin/env bash
#
# clean-ds-store.sh
# حذف كل ملفات .DS_Store من النظام (بما فيها الملفات المخفية)
#
# ملاحظة: قد تحتاج صلاحيات sudo لبعض المجلدات مثل /System, /private
#

set -euo pipefail

# Counters
deleted=0
errors=0

echo "🔍 جاري البحث عن ملفات .DS_Store في كامل النظام..."
echo "   هذا قد يستغرق بضع دقائق حسب حجم القرص."
echo ""

# Search starting from root (/)
# -type f      : files only
# -name        : match exact filename .DS_Store
# -print0      : null-delimited output (safe for special chars)
# xargs -0     : consume null-delimited list
# 2>/dev/null  : suppress permission denied noise (logged separately)

find / -type f -name '.DS_Store' -print0 2>/tmp/ds-store-errors.log | while IFS= read -r -d '' file; do
    if rm -f "$file" 2>/dev/null; then
        ((deleted++)) || true
    else
        ((errors++)) || true
        echo "⚠️  فشل حذف: $file" >&2
    fi
done

# Report any permission errors from find itself
if [ -s /tmp/ds-store-errors.log ]; then
    echo ""
    echo "📋 المجلدات التي لم يتمكن Finder من دخولها (تحتاج sudo):"
    cat /tmp/ds-store-errors.log | sort -u
    rm -f /tmp/ds-store-errors.log
fi

echo ""
echo "✅ انتهى التنظيف"
echo "   📁 الملفات المحذوفة : $deleted"
echo "   ⚠️  الأخطاء           : $errors"
echo ""
echo "💡 نصيحة: شغل السكريبت بـ sudo لحذف ملفات .DS_Store المحمية:"
echo "   sudo bash $0"
