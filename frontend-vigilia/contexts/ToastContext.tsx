import React, { createContext, useContext, useState, ReactNode } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Animated,
    Pressable,
    Modal,
    Platform
} from 'react-native';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react-native';

type ToastType = 'success' | 'error' | 'info';

interface ToastMessage {
    id: string;
    type: ToastType;
    title: string;
    message: string;
}

interface ConfirmOptions {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    onCancel?: () => void;
    destructive?: boolean;
}

interface ToastContextType {
    showToast: (type: ToastType, title: string, message: string) => void;
    showConfirm: (options: ConfirmOptions) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};

export const ToastProvider = ({ children }: { children: ReactNode }) => {
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    const [confirmDialog, setConfirmDialog] = useState<ConfirmOptions | null>(null);

    const showToast = (type: ToastType, title: string, message: string) => {
        const id = Date.now().toString();
        const newToast: ToastMessage = { id, type, title, message };

        setToasts(prev => [...prev, newToast]);

        // Auto-remove after 4 seconds
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 4000);
    };

    const showConfirm = (options: ConfirmOptions) => {
        setConfirmDialog(options);
    };

    const closeConfirm = () => {
        setConfirmDialog(null);
    };

    const removeToast = (id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    };

    return (
        <ToastContext.Provider value={{ showToast, showConfirm }}>
            {children}

            {/* Toast Container */}
            {toasts.length > 0 && (
                <View style={styles.toastContainer}>
                    {toasts.map((toast) => (
                        <ToastCard
                            key={toast.id}
                            toast={toast}
                            onClose={() => removeToast(toast.id)}
                        />
                    ))}
                </View>
            )}

            {/* Confirmation Dialog */}
            {confirmDialog && (
                <Modal
                    transparent
                    visible={!!confirmDialog}
                    animationType="fade"
                    onRequestClose={() => {
                        if (confirmDialog.onCancel) {
                            confirmDialog.onCancel();
                        }
                        closeConfirm();
                    }}
                >
                    <Pressable
                        style={styles.modalOverlay}
                        onPress={() => {
                            if (confirmDialog.onCancel) {
                                confirmDialog.onCancel();
                            }
                            closeConfirm();
                        }}
                    >
                        <Pressable style={styles.confirmDialog} onPress={(e) => e.stopPropagation()}>
                            <Text style={styles.confirmTitle}>{confirmDialog.title}</Text>
                            <Text style={styles.confirmMessage}>{confirmDialog.message}</Text>

                            <View style={styles.confirmButtons}>
                                <Pressable
                                    style={[styles.confirmButton, styles.cancelButton]}
                                    onPress={() => {
                                        if (confirmDialog.onCancel) {
                                            confirmDialog.onCancel();
                                        }
                                        closeConfirm();
                                    }}
                                >
                                    <Text style={styles.cancelButtonText}>
                                        {confirmDialog.cancelText || 'Cancelar'}
                                    </Text>
                                </Pressable>

                                <Pressable
                                    style={[
                                        styles.confirmButton,
                                        confirmDialog.destructive
                                            ? styles.destructiveButton
                                            : styles.primaryButton
                                    ]}
                                    onPress={() => {
                                        confirmDialog.onConfirm();
                                        closeConfirm();
                                    }}
                                >
                                    <Text style={styles.primaryButtonText}>
                                        {confirmDialog.confirmText || 'Confirmar'}
                                    </Text>
                                </Pressable>
                            </View>
                        </Pressable>
                    </Pressable>
                </Modal>
            )}
        </ToastContext.Provider>
    );
};

const ToastCard = ({ toast, onClose }: { toast: ToastMessage; onClose: () => void }) => {
    const getIcon = () => {
        switch (toast.type) {
            case 'success':
                return <CheckCircle size={24} color="#10b981" />;
            case 'error':
                return <AlertCircle size={24} color="#ef4444" />;
            case 'info':
                return <Info size={24} color="#3b82f6" />;
        }
    };

    const getBackgroundColor = () => {
        switch (toast.type) {
            case 'success':
                return '#d1fae5';
            case 'error':
                return '#fee2e2';
            case 'info':
                return '#dbeafe';
        }
    };

    const getBorderColor = () => {
        switch (toast.type) {
            case 'success':
                return '#10b981';
            case 'error':
                return '#ef4444';
            case 'info':
                return '#3b82f6';
        }
    };

    return (
        <View
            style={[
                styles.toastCard,
                { backgroundColor: getBackgroundColor(), borderColor: getBorderColor() }
            ]}
        >
            <View style={styles.toastIcon}>
                {getIcon()}
            </View>
            <View style={styles.toastContent}>
                <Text style={styles.toastTitle}>{toast.title}</Text>
                <Text style={styles.toastMessage}>{toast.message}</Text>
            </View>
            <Pressable onPress={onClose} style={styles.toastClose}>
                <X size={20} color="#6b7280" />
            </Pressable>
        </View>
    );
};

const styles = StyleSheet.create({
    toastContainer: {
        position: 'absolute',
        top: Platform.OS === 'web' ? 20 : 60,
        left: 20,
        right: 20,
        zIndex: 9999,
        gap: 10,
        pointerEvents: 'box-none',
    },
    toastCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 12,
        borderWidth: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 5,
        gap: 12,
    },
    toastIcon: {
        flexShrink: 0,
    },
    toastContent: {
        flex: 1,
        gap: 4,
    },
    toastTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#111827',
    },
    toastMessage: {
        fontSize: 14,
        color: '#4b5563',
    },
    toastClose: {
        padding: 4,
        flexShrink: 0,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    confirmDialog: {
        backgroundColor: '#ffffff',
        borderRadius: 16,
        padding: 24,
        width: '100%',
        maxWidth: 400,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.2,
        shadowRadius: 16,
        elevation: 10,
    },
    confirmTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#111827',
        marginBottom: 12,
    },
    confirmMessage: {
        fontSize: 16,
        color: '#6b7280',
        marginBottom: 24,
        lineHeight: 24,
    },
    confirmButtons: {
        flexDirection: 'row',
        gap: 12,
    },
    confirmButton: {
        flex: 1,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cancelButton: {
        backgroundColor: '#f3f4f6',
    },
    cancelButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#6b7280',
    },
    primaryButton: {
        backgroundColor: '#7c3aed',
    },
    destructiveButton: {
        backgroundColor: '#ef4444',
    },
    primaryButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#ffffff',
    },
});
