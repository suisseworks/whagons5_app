/**
 * FormFiller - React Native dynamic form renderer
 *
 * Renders a FormSchema (from the backend's FormVersion.fields) as native
 * inputs. Mirrors the web client's FormFiller component but uses RN primitives.
 *
 * Supported field types:
 *   text, textarea, select, checkbox, date, number, time, datetime,
 *   single-checkbox, list, barcode (with camera scanner),
 *   signature/image/fixed-image (display-only placeholders for now)
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { FormSchema, FormSchemaField } from '../context/TaskContext';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { fontFamilies, fontSizes, radius } from '../config/designTokens';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FormFillerProps {
  schema: FormSchema;
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
  readOnly?: boolean;
  showValidation?: boolean;
  colors: {
    text: string;
    textSecondary: string;
    surface: string;
    background: string;
  };
  primaryColor: string;
  isDarkMode: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isFieldEmpty(field: FormSchemaField, value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const FormFiller: React.FC<FormFillerProps> = ({
  schema,
  values,
  onChange,
  readOnly = false,
  showValidation = false,
  colors,
  primaryColor,
  isDarkMode,
}) => {
  const handleFieldChange = (fieldId: number, value: unknown) => {
    onChange({ ...values, [fieldId]: value });
  };

  const inputBg = isDarkMode ? 'rgba(31, 36, 34, 0.7)' : '#F3EEE4';
  const borderColor = isDarkMode ? 'rgba(255, 255, 255, 0.12)' : '#E6E1D7';

  const renderField = (field: FormSchemaField) => {
    const fieldValue = values[field.id];
    const hasError = showValidation && !!field.required && isFieldEmpty(field, fieldValue);

    return (
      <View key={field.id} style={styles.fieldContainer}>
        {/* Label */}
        {field.type !== 'single-checkbox' && (
          <View style={styles.labelRow}>
            <Text style={[styles.label, { color: colors.text }]}>
              {field.label || 'Untitled field'}
            </Text>
            {field.required && <Text style={styles.required}>*</Text>}
          </View>
        )}

        {/* Field input */}
        {renderFieldInput(field, fieldValue, hasError)}

        {/* Validation error */}
        {hasError && (
          <Text style={styles.errorText}>This field is required</Text>
        )}
      </View>
    );
  };

  const renderFieldInput = (field: FormSchemaField, value: unknown, _hasError: boolean) => {
    switch (field.type) {
      case 'text':
        return (
          <TextInput
            style={[styles.textInput, { backgroundColor: inputBg, color: colors.text, borderColor }]}
            value={String(value ?? '')}
            onChangeText={(v) => handleFieldChange(field.id, v)}
            placeholder={field.placeholder || `Enter ${field.label?.toLowerCase() || 'text'}...`}
            placeholderTextColor={colors.textSecondary}
            editable={!readOnly}
          />
        );

      case 'barcode':
        return (
          <BarcodeFieldInput
            value={String(value ?? '')}
            onChange={(v) => handleFieldChange(field.id, v)}
            readOnly={readOnly}
            inputBg={inputBg}
            borderColor={borderColor}
            textColor={colors.text}
            secondaryColor={colors.textSecondary}
            primaryColor={primaryColor}
          />
        );

      case 'textarea':
        return (
          <TextInput
            style={[styles.textInput, styles.textArea, { backgroundColor: inputBg, color: colors.text, borderColor }]}
            value={String(value ?? '')}
            onChangeText={(v) => handleFieldChange(field.id, v)}
            placeholder={field.placeholder || 'Enter text...'}
            placeholderTextColor={colors.textSecondary}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            editable={!readOnly}
          />
        );

      case 'number':
        return (
          <NumberFieldInput
            value={value as number | undefined}
            onChange={(v) => handleFieldChange(field.id, v)}
            readOnly={readOnly}
            allowDecimals={field.properties?.allowDecimals}
            inputBg={inputBg}
            borderColor={borderColor}
            textColor={colors.text}
            secondaryColor={colors.textSecondary}
            primaryColor={primaryColor}
          />
        );

      case 'select':
        return (
          <SelectFieldInput
            options={field.options ?? []}
            value={value as string | undefined}
            onChange={(v) => handleFieldChange(field.id, v)}
            readOnly={readOnly}
            inputBg={inputBg}
            borderColor={borderColor}
            textColor={colors.text}
            secondaryColor={colors.textSecondary}
            primaryColor={primaryColor}
          />
        );

      case 'checkbox':
        return (
          <CheckboxFieldInput
            options={field.options ?? []}
            value={(value as string[]) ?? []}
            onChange={(v) => handleFieldChange(field.id, v)}
            readOnly={readOnly}
            textColor={colors.text}
            primaryColor={primaryColor}
          />
        );

      case 'single-checkbox':
        return (
          <SingleCheckboxInput
            label={field.label || 'Untitled field'}
            required={field.required}
            value={!!value}
            onChange={(v) => handleFieldChange(field.id, v)}
            readOnly={readOnly}
            textColor={colors.text}
            primaryColor={primaryColor}
          />
        );

      case 'date':
        return (
          <DateFieldInput
            value={value as string | undefined}
            onChange={(v) => handleFieldChange(field.id, v)}
            mode="date"
            readOnly={readOnly}
            inputBg={inputBg}
            borderColor={borderColor}
            textColor={colors.text}
            secondaryColor={colors.textSecondary}
            primaryColor={primaryColor}
          />
        );

      case 'time':
        return (
          <DateFieldInput
            value={value as string | undefined}
            onChange={(v) => handleFieldChange(field.id, v)}
            mode="time"
            readOnly={readOnly}
            inputBg={inputBg}
            borderColor={borderColor}
            textColor={colors.text}
            secondaryColor={colors.textSecondary}
            primaryColor={primaryColor}
          />
        );

      case 'datetime':
        return (
          <DateFieldInput
            value={value as string | undefined}
            onChange={(v) => handleFieldChange(field.id, v)}
            mode="datetime"
            readOnly={readOnly}
            inputBg={inputBg}
            borderColor={borderColor}
            textColor={colors.text}
            secondaryColor={colors.textSecondary}
            primaryColor={primaryColor}
          />
        );

      case 'list':
        return (
          <ListFieldInput
            value={Array.isArray(value) ? (value as string[]) : ['']}
            onChange={(v) => handleFieldChange(field.id, v)}
            itemType={field.properties?.listItemType || 'text'}
            readOnly={readOnly}
            inputBg={inputBg}
            borderColor={borderColor}
            textColor={colors.text}
            secondaryColor={colors.textSecondary}
            primaryColor={primaryColor}
          />
        );

      case 'signature':
      case 'image':
      case 'fixed-image':
        return (
          <View style={[styles.placeholderField, { borderColor }]}>
            <MaterialIcons
              name={field.type === 'signature' ? 'draw' : 'image'}
              size={24}
              color={colors.textSecondary}
            />
            <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>
              {field.type === 'signature' ? 'Signature' : field.type === 'image' ? 'Image upload' : 'Image'} — available on web
            </Text>
          </View>
        );

      default:
        return (
          <Text style={{ color: colors.textSecondary, fontSize: fontSizes.sm }}>
            Unsupported field type: {field.type}
          </Text>
        );
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      {(schema.title || schema.description) && (
        <View style={styles.header}>
          {schema.title && (
            <Text style={[styles.headerTitle, { color: colors.text }]}>{schema.title}</Text>
          )}
          {schema.description && (
            <Text style={[styles.headerDescription, { color: colors.textSecondary }]}>
              {schema.description}
            </Text>
          )}
        </View>
      )}

      {/* Fields */}
      {schema.fields.map(renderField)}

      {/* Empty state */}
      {schema.fields.length === 0 && (
        <View style={styles.emptyState}>
          <MaterialIcons name="description" size={48} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            No fields in this form
          </Text>
        </View>
      )}
    </View>
  );
};

// ---------------------------------------------------------------------------
// Sub-components for complex field types
// ---------------------------------------------------------------------------

const NumberFieldInput: React.FC<{
  value?: number;
  onChange: (v: number) => void;
  readOnly: boolean;
  allowDecimals?: boolean;
  inputBg: string;
  borderColor: string;
  textColor: string;
  secondaryColor: string;
  primaryColor: string;
}> = ({ value, onChange, readOnly, allowDecimals, inputBg, borderColor, textColor, secondaryColor, primaryColor }) => {
  const [textValue, setTextValue] = useState(value !== undefined && value !== 0 ? String(value) : '');

  const handleChange = (text: string) => {
    setTextValue(text);
    const num = allowDecimals ? parseFloat(text) : parseInt(text, 10);
    if (!isNaN(num)) onChange(num);
    else if (text === '' || text === '-') onChange(0);
  };

  return (
    <View style={[styles.numberRow]}>
      <TouchableOpacity
        style={[styles.numberButton, { borderColor, backgroundColor: inputBg }]}
        onPress={() => { const n = (value ?? 0) - 1; onChange(n); setTextValue(String(n)); }}
        disabled={readOnly}
      >
        <MaterialIcons name="remove" size={20} color={primaryColor} />
      </TouchableOpacity>
      <TextInput
        style={[styles.textInput, styles.numberInput, { backgroundColor: inputBg, color: textColor, borderColor }]}
        value={textValue}
        onChangeText={handleChange}
        keyboardType={allowDecimals ? 'decimal-pad' : 'number-pad'}
        editable={!readOnly}
        placeholder="0"
        placeholderTextColor={secondaryColor}
        textAlign="center"
      />
      <TouchableOpacity
        style={[styles.numberButton, { borderColor, backgroundColor: inputBg }]}
        onPress={() => { const n = (value ?? 0) + 1; onChange(n); setTextValue(String(n)); }}
        disabled={readOnly}
      >
        <MaterialIcons name="add" size={20} color={primaryColor} />
      </TouchableOpacity>
    </View>
  );
};

const SelectFieldInput: React.FC<{
  options: string[];
  value?: string;
  onChange: (v: string) => void;
  readOnly: boolean;
  inputBg: string;
  borderColor: string;
  textColor: string;
  secondaryColor: string;
  primaryColor: string;
}> = ({ options, value, onChange, readOnly, inputBg, borderColor, textColor, secondaryColor, primaryColor }) => {
  return (
    <View style={styles.optionsContainer}>
      {options.filter(o => o.trim()).map((option, index) => {
        const isSelected = value === option;
        return (
          <TouchableOpacity
            key={index}
            style={[
              styles.radioOption,
              { borderColor: isSelected ? primaryColor : borderColor, backgroundColor: isSelected ? `${primaryColor}12` : inputBg },
            ]}
            onPress={() => !readOnly && onChange(option)}
            disabled={readOnly}
            activeOpacity={0.7}
          >
            <View style={[styles.radioCircle, { borderColor: isSelected ? primaryColor : secondaryColor }]}>
              {isSelected && <View style={[styles.radioDot, { backgroundColor: primaryColor }]} />}
            </View>
            <Text style={[styles.optionText, { color: textColor }]}>{option}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const CheckboxFieldInput: React.FC<{
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
  readOnly: boolean;
  textColor: string;
  primaryColor: string;
}> = ({ options, value, onChange, readOnly, textColor, primaryColor }) => {
  const toggle = (option: string) => {
    if (readOnly) return;
    if (value.includes(option)) {
      onChange(value.filter(v => v !== option));
    } else {
      onChange([...value, option]);
    }
  };

  return (
    <View style={styles.optionsContainer}>
      {options.filter(o => o.trim()).map((option, index) => {
        const isChecked = value.includes(option);
        return (
          <TouchableOpacity
            key={index}
            style={styles.checkboxOption}
            onPress={() => toggle(option)}
            disabled={readOnly}
            activeOpacity={0.7}
          >
            <MaterialIcons
              name={isChecked ? 'check-box' : 'check-box-outline-blank'}
              size={24}
              color={isChecked ? primaryColor : '#9E9E9E'}
            />
            <Text style={[styles.optionText, { color: textColor, marginLeft: 10 }]}>{option}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const SingleCheckboxInput: React.FC<{
  label: string;
  required?: boolean;
  value: boolean;
  onChange: (v: boolean) => void;
  readOnly: boolean;
  textColor: string;
  primaryColor: string;
}> = ({ label, required, value, onChange, readOnly, textColor, primaryColor }) => {
  return (
    <TouchableOpacity
      style={styles.checkboxOption}
      onPress={() => !readOnly && onChange(!value)}
      disabled={readOnly}
      activeOpacity={0.7}
    >
      <MaterialIcons
        name={value ? 'check-box' : 'check-box-outline-blank'}
        size={24}
        color={value ? primaryColor : '#9E9E9E'}
      />
      <Text style={[styles.optionText, { color: textColor, marginLeft: 10 }]}>
        {label}{required ? ' *' : ''}
      </Text>
    </TouchableOpacity>
  );
};

const DateFieldInput: React.FC<{
  value?: string;
  onChange: (v: string) => void;
  mode: 'date' | 'time' | 'datetime';
  readOnly: boolean;
  inputBg: string;
  borderColor: string;
  textColor: string;
  secondaryColor: string;
  primaryColor: string;
}> = ({ value, onChange, mode, readOnly, inputBg, borderColor, textColor, secondaryColor, primaryColor }) => {
  const placeholder =
    mode === 'date' ? 'YYYY-MM-DD' :
    mode === 'time' ? 'HH:MM' :
    'YYYY-MM-DD HH:MM';

  const iconName = mode === 'time' ? 'schedule' : 'calendar-today';

  const setNow = () => {
    const now = new Date();
    if (mode === 'date') {
      onChange(now.toISOString().split('T')[0]);
    } else if (mode === 'time') {
      onChange(now.toTimeString().slice(0, 5));
    } else {
      onChange(`${now.toISOString().split('T')[0]} ${now.toTimeString().slice(0, 5)}`);
    }
  };

  return (
    <View style={styles.dateRow}>
      <View style={styles.dateInputWrapper}>
        <MaterialIcons name={iconName} size={18} color={secondaryColor} style={{ marginRight: 8 }} />
        <TextInput
          style={[styles.textInput, styles.dateTextInput, { backgroundColor: inputBg, color: textColor, borderColor }]}
          value={String(value ?? '')}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={secondaryColor}
          editable={!readOnly}
        />
      </View>
      {!readOnly && (
        <TouchableOpacity
          style={[styles.nowButton, { borderColor: primaryColor }]}
          onPress={setNow}
        >
          <Text style={[styles.nowButtonText, { color: primaryColor }]}>Now</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

/** Standalone barcode field: text input + scan button */
const BarcodeFieldInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  readOnly: boolean;
  inputBg: string;
  borderColor: string;
  textColor: string;
  secondaryColor: string;
  primaryColor: string;
}> = ({ value, onChange, readOnly, inputBg, borderColor, textColor, secondaryColor, primaryColor }) => {
  const [scannerOpen, setScannerOpen] = useState(false);

  return (
    <View>
      <View style={styles.barcodeRow}>
        <TextInput
          style={[styles.textInput, styles.barcodeInput, { backgroundColor: inputBg, color: textColor, borderColor }]}
          value={value}
          onChangeText={onChange}
          placeholder="Scan or enter barcode"
          placeholderTextColor={secondaryColor}
          editable={!readOnly}
        />
        {!readOnly && (
          <TouchableOpacity
            style={[styles.scanButton, { backgroundColor: primaryColor }]}
            onPress={() => setScannerOpen(true)}
          >
            <MaterialIcons name="qr-code-scanner" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </View>
      <BarcodeScannerModal
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={(scanned) => {
          onChange(scanned);
          setScannerOpen(false);
        }}
      />
    </View>
  );
};

/** A single barcode list item with its own scanner state */
const BarcodeListItem: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  readOnly: boolean;
  inputBg: string;
  borderColor: string;
  textColor: string;
  secondaryColor: string;
  primaryColor: string;
}> = ({ value, onChange, placeholder, readOnly, inputBg, borderColor, textColor, secondaryColor, primaryColor }) => {
  const [scannerOpen, setScannerOpen] = useState(false);

  return (
    <View style={styles.barcodeRow}>
      <TextInput
        style={[styles.textInput, styles.barcodeInput, { backgroundColor: inputBg, color: textColor, borderColor }]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={secondaryColor}
        editable={!readOnly}
      />
      {!readOnly && (
        <TouchableOpacity
          style={[styles.scanButton, { backgroundColor: primaryColor }]}
          onPress={() => setScannerOpen(true)}
        >
          <MaterialIcons name="qr-code-scanner" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      )}
      <BarcodeScannerModal
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={(scanned) => {
          onChange(scanned);
          setScannerOpen(false);
        }}
      />
    </View>
  );
};

const ListFieldInput: React.FC<{
  value: string[];
  onChange: (v: string[]) => void;
  itemType: string;
  readOnly: boolean;
  inputBg: string;
  borderColor: string;
  textColor: string;
  secondaryColor: string;
  primaryColor: string;
}> = ({ value, onChange, itemType, readOnly, inputBg, borderColor, textColor, secondaryColor, primaryColor }) => {
  const handleItemChange = (index: number, text: string) => {
    const newValue = [...value];
    newValue[index] = text;
    onChange(newValue);
  };

  const addItem = () => {
    onChange([...value, '']);
  };

  const removeItem = (index: number) => {
    if (value.length <= 1) return;
    onChange(value.filter((_, i) => i !== index));
  };

  const keyboardType = itemType === 'number' ? 'numeric' as const : 'default' as const;
  const isBarcode = itemType === 'barcode';

  return (
    <View>
      {value.map((item, index) => (
        <View key={index} style={styles.listItemRow}>
          <Text style={[styles.listItemNumber, { color: secondaryColor }]}>{index + 1}.</Text>
          {isBarcode ? (
            <View style={styles.listItemInput}>
              <BarcodeListItem
                value={String(item)}
                onChange={(v) => handleItemChange(index, v)}
                placeholder={`Scan barcode ${index + 1}`}
                readOnly={readOnly}
                inputBg={inputBg}
                borderColor={borderColor}
                textColor={textColor}
                secondaryColor={secondaryColor}
                primaryColor={primaryColor}
              />
            </View>
          ) : (
            <TextInput
              style={[styles.textInput, styles.listItemInput, { backgroundColor: inputBg, color: textColor, borderColor }]}
              value={String(item)}
              onChangeText={(v) => handleItemChange(index, v)}
              placeholder={`Item ${index + 1}`}
              placeholderTextColor={secondaryColor}
              keyboardType={keyboardType}
              editable={!readOnly}
            />
          )}
          {!readOnly && value.length > 1 && (
            <TouchableOpacity onPress={() => removeItem(index)} style={styles.listRemoveButton}>
              <MaterialIcons name="close" size={18} color="#F44336" />
            </TouchableOpacity>
          )}
        </View>
      ))}
      {!readOnly && (
        <TouchableOpacity style={[styles.listAddButton, { borderColor: primaryColor }]} onPress={addItem}>
          <MaterialIcons name="add" size={18} color={primaryColor} />
          <Text style={[styles.listAddText, { color: primaryColor }]}>Add item</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
  },
  header: {
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E6E1D7',
  },
  headerTitle: {
    fontSize: fontSizes.lg,
    fontFamily: fontFamilies.displaySemibold,
    marginBottom: 4,
  },
  headerDescription: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyRegular,
  },
  fieldContainer: {
    marginBottom: 20,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
  },
  required: {
    color: '#F44336',
    marginLeft: 4,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
  },
  errorText: {
    marginTop: 4,
    color: '#F44336',
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyMedium,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
  },
  textArea: {
    minHeight: 100,
    paddingTop: 12,
  },
  // Number
  numberRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  numberButton: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  numberInput: {
    flex: 1,
    marginHorizontal: 8,
  },
  // Select (radio)
  optionsContainer: {
    gap: 8,
  },
  radioOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  optionText: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
  },
  // Checkbox
  checkboxOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  // Date
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateTextInput: {
    flex: 1,
  },
  dateText: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
  },
  nowButton: {
    marginLeft: 8,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  nowButtonText: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
  },
  // Placeholder (signature, image)
  placeholderField: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: radius.md,
    borderStyle: 'dashed',
  },
  placeholderText: {
    marginLeft: 10,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
  },
  // List
  listItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  listItemNumber: {
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
    marginRight: 8,
    width: 20,
  },
  listItemInput: {
    flex: 1,
  },
  listRemoveButton: {
    marginLeft: 8,
    padding: 4,
  },
  listAddButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: radius.md,
    borderStyle: 'dashed',
    marginTop: 4,
  },
  listAddText: {
    marginLeft: 6,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodySemibold,
  },
  // Barcode
  barcodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  barcodeInput: {
    flex: 1,
  },
  scanButton: {
    marginLeft: 8,
    width: 46,
    height: 46,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    marginTop: 8,
    fontSize: fontSizes.sm,
    fontFamily: fontFamilies.bodyMedium,
  },
});

export default FormFiller;
