import React, { createContext, useContext, useState, useEffect } from 'react';

type Language = 'English' | 'Chichewa';

interface SettingsContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  dataSaver: boolean;
  setDataSaver: (enabled: boolean) => void;
  t: (key: string) => string;
}

const translations: Record<Language, Record<string, string>> = {
  English: {
    'nav.home': 'Home',
    'nav.videos': 'Videos',
    'nav.market': 'Market',
    'nav.messages': 'Messages',
    'nav.profile': 'Profile',
    'nav.search': 'Search',
    'nav.wallet': 'Wallet',
    'common.verified': 'Verified',
    'common.search': 'Search...',
    'market.index': 'Price Index',
    'market.buy': 'Buy Now',
    'market.sell': 'Sell Item',
    'settings.languages': 'Language',
    'settings.dataSaver': 'Data Saver',
    'settings.dataSaverDesc': 'Reduce video quality to save mobile data',
    'profile.edit': 'Edit Profile',
    'profile.admin': 'Admin Control',
    'profile.logout': 'Sign Out',
    'market.commodityPrices': 'Commodity Prices',
    'market.lastUpdated': 'Last updated',
    'market.district': 'District',
    'market.price': 'Price (MWK)',
    'payment.mobileMoney': 'Mobile Money Checkout',
    'payment.airtel': 'Airtel Money',
    'payment.tnm': 'TNM Mpamba',
    'payment.confirm': 'Confirm Payment',
    'payment.ref': 'Reference Number',
    'payment.processing': 'Processing payment...',
    'payment.success': 'Payment Successful!',
    'payment.wait': 'Check your phone for USSD prompt',
    'video.comments': 'Comments',
    'video.share': 'Share',
    'video.post': 'Post',
    'profile.activity': 'Activity',
    'profile.all': 'All',
    'profile.posts': 'Posts',
    'profile.comments': 'Comments',
    'profile.recentActivity': 'Recent Activity',
    'profile.noActivity': 'No recent activity found',
    'profile.noPosts': 'No posts yet',
    'profile.noVideos': 'No videos yet',
    'profile.joined': 'Joined',
    'profile.followers': 'Followers',
    'profile.following': 'Following',
    'profile.walletBalance': 'Zathu Wallet Balance',
    'profile.history': 'History',
    'profile.deposit': 'Deposit',
    'profile.withdraw': 'Withdraw',
    'profile.transactions': 'Transaction History',
    'profile.currencyNote': 'Prices in Malawi Kwacha (MWK)',
    'profile.identityVerification': 'Identity Verification',
    'profile.getVerified': 'Get Verified',
    'profile.verifiedBadgeDesc': 'Verified users get a blue badge and increased trust in the marketplace. Please upload a clear photo of your National ID or Passport.',
    'profile.uploadID': 'Upload Government ID',
    'profile.idProcessingDesc': 'Your document is processed securely using AI and is never shared with other users.',
    'profile.submitVerification': 'Submit for Verification',
    'profile.verifying': 'Verifying Identity...',
    'profile.shareFirstPost': 'Share your first update',
    'profile.shareFirstVideo': 'Share your first video',
    'common.loading': 'Loading content...',
    'wallet.send': 'Send',
    'wallet.topup': 'Top Up',
    'wallet.cashout': 'Cash Out',
    'wallet.bills': 'Bills',
    'wallet.spendingTrends': 'Spending Trends',
    'wallet.last30days': 'Last 30 Days',
    'wallet.recentTransactions': 'Recent Transactions',
    'wallet.paymentMethods': 'Payment Methods',
    'wallet.addMethod': 'Add Method',
    'wallet.balanceAvailable': 'Available Balance',
    'wallet.income': 'Income',
    'wallet.expense': 'Expense',
  },
  Chichewa: {
    'nav.home': 'Kunyumba',
    'nav.videos': 'Mavidiyo',
    'nav.market': 'Msika',
    'nav.messages': 'Mauthenga',
    'nav.profile': 'Mbiri',
    'nav.search': 'Fufuzani',
    'nav.wallet': 'Chikwama',
    'common.verified': 'Otsimikizika',
    'common.search': 'Fufuzani...',
    'market.index': 'Mitengo ya pa Msika',
    'market.buy': 'Gulani',
    'market.sell': 'Gulitsani Thupi',
    'settings.languages': 'Chilankhulo',
    'settings.dataSaver': 'Kusunga Data',
    'settings.dataSaverDesc': 'Chepetsani mavidiyo kuti musunge data',
    'profile.edit': 'Sinthani Mbiri',
    'profile.admin': "Zoyang'anira",
    'profile.logout': 'Tulukani',
    'market.commodityPrices': 'Mitengo ya Katundu',
    'market.lastUpdated': 'Zosinthidwa komaliza',
    'market.district': 'Boma',
    'market.price': 'Mtengo (MWK)',
    'payment.mobileMoney': 'Lipirani ndi Mobile Money',
    'payment.airtel': 'Airtel Money',
    'payment.tnm': 'TNM Mpamba',
    'payment.confirm': 'Tsimikizani Kulipira',
    'payment.ref': 'Nambala ya Batch',
    'payment.processing': 'Tikukonza malipiro...',
    'payment.success': 'Malipiro Apambana!',
    'payment.wait': 'Onani pafoni yanu kuti mutsimikize',
    'video.comments': 'Ndemanga',
    'video.share': 'Gawani',
    'video.post': 'Tumizani',
    'profile.activity': 'Zochitika',
    'profile.all': 'Zonse',
    'profile.posts': 'Zolemba',
    'profile.comments': 'Ndemanga',
    'profile.recentActivity': 'Zochitika Zaposachedwa',
    'profile.noActivity': 'Palibe zochitika zaposachedwa',
    'profile.noPosts': 'Palibe zolemba pano',
    'profile.noVideos': 'Palibe mavidiyo pano',
    'profile.joined': 'Munalowa nawo mu',
    'profile.followers': 'Otsatira',
    'profile.following': 'Otsatiridwa',
    'profile.walletBalance': 'Ndalama za Zathu',
    'profile.history': 'Zolembedwa',
    'profile.deposit': 'Ikani Ndalama',
    'profile.withdraw': 'Tulutsani Ndalama',
    'profile.transactions': 'Mndandanda wa Malipiro',
    'profile.currencyNote': 'Mitengo ili munjira ya Malawi Kwacha (MWK)',
    'profile.identityVerification': 'Kutsimikizira Munthu',
    'profile.getVerified': 'Tsimikizirani Mbiri Yanu',
    'profile.verifiedBadgeDesc': 'Anthu otsimikizika amalandira chizindikiro cha blue ndi kukhulupirika pa msika. Chonde tumizani chithunzi cha ID yanu kapena Passport.',
    'profile.uploadID': 'Tumizani Government ID',
    'profile.idProcessingDesc': 'ID yanu idzawonetedwa ndi AI mwachinsinsi ndipo sidzagawidwa ndi wina aliyense.',
    'profile.submitVerification': 'Tumizani Kuti Atsimikize',
    'profile.verifying': 'Tikutsimikizira Mbiri...',
    'profile.shareFirstPost': 'Tumizani zochitika zanu zoyamba',
    'profile.shareFirstVideo': 'Tumizani vidiyo yanu yoyamba',
    'common.loading': 'Tikubweretsa zinthu...',
    'wallet.send': 'Tumizani',
    'wallet.topup': 'Onjezerani',
    'wallet.cashout': 'Tulutsani',
    'wallet.bills': 'Malipiro a Ngongole',
    'wallet.spendingTrends': 'Momwe Mwagwiritsira Ntchito Ndalama',
    'wallet.last30days': 'Masiku 30 Apitawo',
    'wallet.recentTransactions': 'Malipiro aposachedwa',
    'wallet.paymentMethods': 'Njira Zolipirira',
    'wallet.addMethod': 'Onjezani Njira',
    'wallet.balanceAvailable': 'Ndalama Zomwe Zilipo',
    'wallet.income': 'Zolowa',
    'wallet.expense': 'Zotuluka',
  }
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('app-language');
    return (saved as Language) || 'English';
  });
  const [dataSaver, setDataSaver] = useState(() => {
    const saved = localStorage.getItem('app-datasaver');
    return saved === 'true';
  });

  useEffect(() => {
    localStorage.setItem('app-language', language);
  }, [language]);

  useEffect(() => {
    localStorage.setItem('app-datasaver', String(dataSaver));
  }, [dataSaver]);

  const t = (key: string) => {
    return translations[language][key] || key;
  };

  return (
    <SettingsContext.Provider value={{ language, setLanguage, dataSaver, setDataSaver, t }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
